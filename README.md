# Burnbox

A barebones way to send fully private notes and files, built on top of Cloudflare workers. All encryption is done client-side, i.e. the server never sees what you have sent!

Has support for generic text messages, as well as file attachments (< 100MB total), plus password protection.

## Threat Model

Burnbox was made to have as little knowledge as possible on the server side. For any given note, we only store:

1. Encrypted note content and files (ciphertext only)
2. (Optional) Password hash for server-side gating to download the ciphertext
3. Expiry time (maximum 30 days)
4. Burn-after-read count (how many times a note can be viewed before deletion)

A note is deleted whenever **either** of (3) or (4) is reached, whichever comes first.

The plaintext is never seen on the server side.

### Encryption flow

1. Generate a random AES-128 key as the [Data Encryption Key (DEK)](https://en.wikipedia.org/wiki/Hybrid_cryptosystem#Envelope_encryption)
2. Encrypt each note/file with DEK using AES-GCM, storing `IV + Ciphertext` server-side
3. If a password is provided:
   - Derive a [Key Encryption Key (KEK)](https://en.wikipedia.org/wiki/Hybrid_cryptosystem#Envelope_encryption) from the password via PBKDF2
   - Wrap the DEK with the KEK using [AES-KW](https://datatracker.ietf.org/doc/html/rfc3394)
   - Derive a separate password hash (PBKDF2, independent salt) for server-side access control
4. Share a URL of the form `https://<base-url>/<note-id>#<key>`

The `#` fragment is never sent to the server, and stays entirely client-side. Without a password, the `<key>` contains the raw DEK. With a password, it contains the wrapped DEK, which is useless without the password to unwrap it.

Note here that we are using PBKDF2 to derive the KEK, which is perhaps less ideal than something like Argon2ID, but I wanted to keep the trust surface area as small as possible (i.e. only use stuff available in [WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)). Perhaps we might want to switch in the future. AES-128 was also chosen since it's known to still be secure, while also giving us the benefit of smaller key sizes (and hence smaller URL sizes).

### Decryption flow

1. Parse the key from the URL fragment
2. If password-protected:
   - Fetch password salt from `/api/note/:id/meta`
   - Prompt user for password
   - Re-compute the password hash using the salt and the password
   - Derive the KEK from the password and unwrap the DEK
3. Fetch the encrypted note from the server (sending along `X-Password-Hash: hash` if password was prompted for).
   a. If no password, then return ciphertext(s)
   b. If password, then return the ciphertext(s) if and only if password hashes match
4. Decrypt ciphertext(s) with the DEK

### Moderation

Because all content is encrypted or hashed client-side before it reaches the server, Burnbox has no ability to inspect, filter, or moderate what is stored. The server only ever sees ciphertext.

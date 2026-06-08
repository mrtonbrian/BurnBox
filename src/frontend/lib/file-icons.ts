import type { IconName } from "../components/icons.js";

interface FileLike {
  name: string;
  type?: string;
  mime_type?: string;
}

const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip"]);

const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "html",
  "java",
  "js",
  "jsx",
  "json",
  "kt",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "log", "odt", "pages", "pdf", "rtf", "txt"]);

const PRESENTATION_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "numbers", "ods", "tsv", "xls", "xlsx"]);

export function resolveFileIcon(file: FileLike): IconName {
  const mime = (file.type || file.mime_type || "").toLowerCase();
  const extension = getExtension(file.name);

  if (mime.startsWith("image/")) return "FileImage";
  if (mime.startsWith("video/")) return "FileVideo";
  if (mime.startsWith("audio/")) return "FileAudio";
  if (mime.startsWith("text/")) return "FileText";
  if (mime.includes("spreadsheet") || mime.includes("csv")) return "FileSpreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "Presentation";
  if (mime.includes("zip") || mime.includes("x-tar") || mime.includes("x-7z")) {
    return "FileArchive";
  }
  if (mime.includes("json") || mime.includes("xml") || mime.includes("javascript")) {
    return "FileCode";
  }
  if (mime === "application/pdf") return "FileText";

  if (SPREADSHEET_EXTENSIONS.has(extension)) return "FileSpreadsheet";
  if (PRESENTATION_EXTENSIONS.has(extension)) return "Presentation";
  if (ARCHIVE_EXTENSIONS.has(extension)) return "FileArchive";
  if (CODE_EXTENSIONS.has(extension)) return "FileCode";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "FileText";

  return "File";
}

function getExtension(name: string): string {
  const normalized = name.toLowerCase().trim();
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot < 0 || lastDot === normalized.length - 1) return "";
  return normalized.slice(lastDot + 1);
}

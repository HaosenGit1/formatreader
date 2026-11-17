/** Terraform / HCL grammar for highlight.js (no official one exists). */
import type { HLJSApi, Language } from 'highlight.js';

export default function hcl(hljs: HLJSApi): Language {
  const INTERPOLATION = { className: 'subst', begin: /\$\{/, end: /\}/, keywords: { literal: 'true false null' } };
  return {
    name: 'HCL',
    aliases: ['terraform', 'tf', 'tfvars'],
    keywords: {
      keyword: 'resource data variable output locals module provider terraform backend required_providers for_each count depends_on lifecycle dynamic content for in if moved import check',
      literal: 'true false null',
      built_in: 'var local module data each count path self',
    },
    contains: [
      hljs.HASH_COMMENT_MODE,
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      { className: 'string', begin: /"/, end: /"/, contains: [hljs.BACKSLASH_ESCAPE, INTERPOLATION] },
      { className: 'string', begin: /<<-?\s*EOT/, end: /^\s*EOT\b/m, contains: [INTERPOLATION] },
      { className: 'number', begin: /\b\d+(\.\d+)?\b/ },
      // `name =` → attribute
      { className: 'attr', begin: /\b[A-Za-z_][\w-]*(?=\s*=(?!=))/ },
      // block labels: resource "aws_s3_bucket" "site"
      { className: 'title', begin: /(?<=^\s*(resource|data|module|variable|output|provider)\s+)"[^"]*"/ },
    ],
  };
}

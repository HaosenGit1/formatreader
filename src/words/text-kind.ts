/**
 * Decides how a decoded text file should be shown: as a table, subtitles,
 * rendered Markdown/HTML, pretty JSON, highlighted code, or plain reading text.
 */

export type TextKind =
  | { kind: 'table'; delimiter: string }
  | { kind: 'subtitle'; format: 'srt' | 'vtt' | 'ass' }
  | { kind: 'markdown' }
  | { kind: 'html' }
  | { kind: 'json'; lines: boolean }
  | { kind: 'code'; language: string }
  | { kind: 'plain' };

/** File extension → highlight.js language id. */
const CODE: Record<string, string> = {
  // Web
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less', styl: 'stylus',
  vue: 'xml', svelte: 'xml', astro: 'xml', php: 'php', phtml: 'php',
  erb: 'erb', hbs: 'handlebars', handlebars: 'handlebars', twig: 'twig', haml: 'haml',
  // General purpose
  py: 'python', pyw: 'python', pyi: 'python', java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ino: 'arduino',
  cs: 'csharp', csx: 'csharp', fs: 'fsharp', fsx: 'fsharp', vb: 'vbnet', vbs: 'vbscript', bas: 'basic',
  go: 'go', rs: 'rust', swift: 'swift', m: 'objectivec', mm: 'objectivec',
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby', dart: 'dart', scala: 'scala', sc: 'scala',
  groovy: 'groovy', gvy: 'groovy', lua: 'lua', r: 'r', jl: 'julia', pl: 'perl', pm: 'perl',
  hs: 'haskell', lhs: 'haskell', elm: 'elm', ex: 'elixir', exs: 'elixir', erl: 'erlang', hrl: 'erlang',
  clj: 'clojure', cljs: 'clojure', edn: 'clojure', lisp: 'lisp', el: 'lisp', scm: 'scheme', rkt: 'scheme',
  ml: 'ocaml', mli: 'ocaml', re: 'reasonml', nim: 'nim', cr: 'crystal', d: 'd', v: 'verilog',
  sv: 'verilog', vhd: 'vhdl', vhdl: 'vhdl', f: 'fortran', f90: 'fortran', f95: 'fortran', for: 'fortran',
  pas: 'delphi', dpr: 'delphi', pp: 'delphi', ada: 'ada', adb: 'ada', ads: 'ada', cob: 'plaintext',
  asm: 'x86asm', s: 'armasm', nasm: 'x86asm', wat: 'wasm', ll: 'llvm', zig: 'rust', vala: 'vala',
  tcl: 'tcl', coffee: 'coffeescript', ls: 'livescript', hx: 'haxe', ps: 'plaintext',
  matlab: 'matlab', sas: 'sas', do: 'stata', mat: 'matlab', mpl: 'maple', nb: 'mathematica', wl: 'mathematica',
  // Industrial / engineering
  st: 'delphi', scl: 'delphi', il: 'plaintext', awl: 'plaintext', gcode: 'gcode', nc: 'gcode', ngc: 'gcode',
  tap: 'gcode', step: 'step21', stp: 'step21', p21: 'step21', scad: 'openscad', glsl: 'glsl', frag: 'glsl', vert: 'glsl',
  // Shell / scripts
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ksh: 'bash', command: 'bash',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell', bat: 'dos', cmd: 'dos',
  ahk: 'autohotkey', au3: 'autoit', applescript: 'applescript', scpt: 'applescript', awk: 'awk',
  // Data / config
  xml: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', svg: 'xml', plist: 'xml', rss: 'xml', atom: 'xml',
  xaml: 'xml', csproj: 'xml', vbproj: 'xml', props: 'xml', targets: 'xml', resx: 'xml', config: 'xml',
  wsdl: 'xml', kml: 'xml', gpx: 'xml', fb2: 'xml', opf: 'xml', ncx: 'xml', xlf: 'xml', l5x: 'xml', drawio: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', inf: 'ini', reg: 'ini',
  properties: 'properties', env: 'bash', editorconfig: 'ini', gitconfig: 'ini', desktop: 'ini',
  sql: 'sql', psql: 'pgsql', mysql: 'sql', graphql: 'graphql', gql: 'graphql', prisma: 'plaintext',
  proto: 'protobuf', thrift: 'thrift', capnp: 'capnproto',
  tex: 'latex', sty: 'latex', cls: 'latex', bib: 'latex', ltx: 'latex',
  diff: 'diff', patch: 'diff', http: 'http', rest: 'http', nginx: 'nginx', htaccess: 'apache',
  dockerfile: 'dockerfile', containerfile: 'dockerfile', makefile: 'makefile', mk: 'makefile', mak: 'makefile',
  cmake: 'cmake', gradle: 'gradle', nix: 'nix', tf: 'plaintext', hcl: 'plaintext', bicep: 'plaintext',
  adoc: 'asciidoc', asciidoc: 'asciidoc', rst: 'plaintext', org: 'plaintext', textile: 'plaintext',
  dxf: 'plaintext', obj: 'plaintext', ifc: 'step21', ics: 'plaintext', vcf: 'plaintext', ldif: 'ldif',
  pem: 'plaintext', crt: 'plaintext', key: 'plaintext', pub: 'plaintext', asc: 'plaintext',
  gitignore: 'bash', dockerignore: 'bash', npmrc: 'ini', lock: 'plaintext', sum: 'plaintext', mod: 'go',
};

/** Whole file names that have no extension but a known language. */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile', containerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile',
  cmakelists: 'cmake', rakefile: 'ruby', gemfile: 'ruby', podfile: 'ruby', vagrantfile: 'ruby',
  jenkinsfile: 'groovy', procfile: 'bash', '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash',
  '.gitignore': 'bash', '.env': 'bash', '.editorconfig': 'ini', '.gitconfig': 'ini', '.npmrc': 'ini',
};

const PLAIN_EXT = new Set(['txt', 'text', 'log', 'nfo', 'diz', 'me', 'readme', '1st', 'out', 'err', 'asc', '']);

/** Choose the CSV delimiter that splits the first lines most consistently. */
export function sniffDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ',';
  let bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
    const score = counts[0] * consistent;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function sniffContent(text: string): TextKind | null {
  const head = text.slice(0, 4000).replace(/^﻿/, '');
  const t = head.trimStart();
  if (/^WEBVTT/.test(t)) return { kind: 'subtitle', format: 'vtt' };
  if (/^\[Script Info\]/i.test(t)) return { kind: 'subtitle', format: 'ass' };
  if (/^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}/.test(t)) return { kind: 'subtitle', format: 'srt' };
  if (/^<!doctype html|^<html[\s>]/i.test(t)) return { kind: 'html' };
  if (/^<\?xml|^<[a-z][\w:-]*[\s>][\s\S]*<\/[a-z][\w:-]*>/i.test(t) && t.startsWith('<')) return { kind: 'code', language: 'xml' };
  if (/^[{[]/.test(t)) {
    try {
      JSON.parse(text);
      return { kind: 'json', lines: false };
    } catch {
      /* not JSON */
    }
  }
  if (/^#!.*\b(ba|z|k)?sh\b/.test(t)) return { kind: 'code', language: 'bash' };
  if (/^#!.*\bpython/.test(t)) return { kind: 'code', language: 'python' };
  if (/^#!.*\bnode\b/.test(t)) return { kind: 'code', language: 'javascript' };
  return null;
}

export function classifyText(fileName: string, text: string): TextKind {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const lower = base.toLowerCase();
  const ext = /\.([a-z0-9_+-]{1,16})$/i.exec(lower)?.[1] ?? '';

  if (ext === 'csv') return { kind: 'table', delimiter: sniffDelimiter(text.slice(0, 20000)) };
  if (ext === 'tsv' || ext === 'tab') return { kind: 'table', delimiter: '\t' };
  if (ext === 'psv') return { kind: 'table', delimiter: '|' };
  if (ext === 'srt') return { kind: 'subtitle', format: 'srt' };
  if (ext === 'vtt') return { kind: 'subtitle', format: 'vtt' };
  if (ext === 'ass' || ext === 'ssa') return { kind: 'subtitle', format: 'ass' };
  if (['md', 'markdown', 'mdown', 'mkd', 'mdx'].includes(ext)) return { kind: 'markdown' };
  if (['html', 'htm', 'xhtml', 'shtml'].includes(ext)) return { kind: 'html' };
  if (['json', 'geojson', 'webmanifest', 'har', 'ipynb', 'jsonc', 'json5', 'babelrc', 'eslintrc'].includes(ext)) {
    return { kind: 'json', lines: false };
  }
  if (ext === 'jsonl' || ext === 'ndjson') return { kind: 'json', lines: true };
  if (BY_NAME[lower]) return { kind: 'code', language: BY_NAME[lower] };
  if (/^(makefile|dockerfile)\./.test(lower)) return { kind: 'code', language: lower.startsWith('make') ? 'makefile' : 'dockerfile' };
  if (CODE[ext]) return { kind: 'code', language: CODE[ext] };

  if (PLAIN_EXT.has(ext) || !ext) {
    // .txt files are what people read as books; only sniff when there is no extension.
    if (!ext) return sniffContent(text) ?? { kind: 'plain' };
    return { kind: 'plain' };
  }
  // Unknown extension: use content clues, else plain text.
  return sniffContent(text) ?? { kind: 'plain' };
}

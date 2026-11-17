/**
 * Which programming / data language a file is written in.
 * Decided from the file name first, then from the first bytes of content.
 */

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
  // No highlighter yet: still shown as code (line numbers), without colours.
  sol: 'plaintext', vy: 'python', move: 'rust', cairo: 'rust', cbl: 'plaintext', cobol: 'plaintext', abap: 'plaintext',
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

/** Data formats that are pretty-printed before highlighting. */
const JSON_EXT = new Set(['json', 'geojson', 'webmanifest', 'har', 'ipynb', 'jsonc', 'json5', 'babelrc', 'eslintrc', 'jsonl', 'ndjson']);

export interface CodeKind {
  language: string;
  /** JSON documents are reformatted; JSON Lines are not. */
  json?: 'document' | 'lines';
}

const extOf = (lowerName: string) => /\.([a-z0-9_+-]{1,16})$/i.exec(lowerName)?.[1] ?? '';

/** Content clues for files without a telling name. `head` is the start of the file as text. */
function sniff(head: string): CodeKind | null {
  const t = head.replace(/^\uFEFF/, '').trimStart();
  if (/^#!.*\b(ba|z|k)?sh\b/.test(t)) return { language: 'bash' };
  if (/^#!.*\bpython/.test(t)) return { language: 'python' };
  if (/^#!.*\bnode\b/.test(t)) return { language: 'javascript' };
  if (/^#!.*\bperl\b/.test(t)) return { language: 'perl' };
  if (/^#!.*\bruby\b/.test(t)) return { language: 'ruby' };
  if (/^<\?xml/.test(t)) return { language: 'xml' };
  if (/^[{[]\s*["{[\]0-9-]/.test(t) || /^[{[]\s*$/.test(t.slice(0, 3))) return { language: 'json', json: 'document' };
  return null;
}

/**
 * Returns the language for a file, or null if it is not code (plain text,
 * Markdown, HTML, subtitles … are handled by the Text viewer).
 */
export function codeKind(fileName: string, head: string): CodeKind | null {
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).toLowerCase();
  const ext = extOf(base);
  if (JSON_EXT.has(ext)) return { language: 'json', json: ext === 'jsonl' || ext === 'ndjson' ? 'lines' : 'document' };
  if (BY_NAME[base]) return { language: BY_NAME[base] };
  if (/^(makefile|dockerfile)\./.test(base)) return { language: base.startsWith('make') ? 'makefile' : 'dockerfile' };
  if (CODE[ext]) return { language: CODE[ext] };
  // Names that say "plain text" or "document" are never treated as code.
  if (ext && ['txt', 'text', 'log', 'md', 'markdown', 'html', 'htm', 'srt', 'vtt', 'ass', 'ssa', 'csv', 'tsv'].includes(ext)) return null;
  return sniff(head);
}

export const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', csharp: 'C#', cpp: 'C++', c: 'C', fsharp: 'F#',
  objectivec: 'Objective-C', php: 'PHP', sql: 'SQL', pgsql: 'PostgreSQL', json: 'JSON', xml: 'XML',
  yaml: 'YAML', ini: 'INI / TOML', css: 'CSS', scss: 'SCSS', less: 'Less', bash: 'Shell', dos: 'Batch',
  powershell: 'PowerShell', vbnet: 'VB.NET', vbscript: 'VBScript', delphi: 'Pascal / Structured Text',
  x86asm: 'Assembly', armasm: 'ARM Assembly', gcode: 'G-code', step21: 'STEP', glsl: 'GLSL', latex: 'LaTeX',
  graphql: 'GraphQL', protobuf: 'Protocol Buffers', dockerfile: 'Dockerfile', makefile: 'Makefile',
  cmake: 'CMake', vhdl: 'VHDL', http: 'HTTP', plaintext: 'Text', markdown: 'Markdown', ocaml: 'OCaml',
  matlab: 'MATLAB', sas: 'SAS', llvm: 'LLVM IR', wasm: 'WebAssembly', asciidoc: 'AsciiDoc', ldif: 'LDIF',
};

export function languageName(id: string): string {
  return LANGUAGE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

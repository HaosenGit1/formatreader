/** Solidity grammar for highlight.js (no official one exists). */
import type { HLJSApi, Language } from 'highlight.js';

const INTS = Array.from({ length: 32 }, (_, i) => (i + 1) * 8);
const TYPES = [
  'address', 'bool', 'string', 'bytes', 'byte', 'int', 'uint', 'fixed', 'ufixed',
  ...INTS.map((n) => `int${n}`),
  ...INTS.map((n) => `uint${n}`),
  ...Array.from({ length: 32 }, (_, i) => `bytes${i + 1}`),
].join(' ');

export default function solidity(hljs: HLJSApi): Language {
  return {
    name: 'Solidity',
    aliases: ['sol'],
    keywords: {
      keyword:
        'pragma solidity contract interface library abstract function modifier event emit error struct enum mapping returns return ' +
        'if else for while do break continue new delete public private internal external pure view payable constant immutable ' +
        'virtual override memory storage calldata using import is as from constructor fallback receive require assert revert ' +
        'try catch unchecked assembly type',
      type: TYPES,
      literal: 'true false wei gwei ether seconds minutes hours days weeks',
      built_in: 'msg block tx this super abi keccak256 sha256 ecrecover addmod mulmod selfdestruct',
    },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      { className: 'number', begin: /\b(0x[0-9a-fA-F]+|\d+(\.\d+)?(e\d+)?)\b/ },
      { className: 'title', begin: /(?<=\b(contract|interface|library|function|modifier|event|struct|enum|error)\s+)[A-Za-z_]\w*/ },
    ],
  };
}

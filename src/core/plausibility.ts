/**
 * How much does a piece of text look like real writing (as opposed to 乱码)?
 * Used to choose between candidate repairs: real text in any language scores
 * high; mojibake — rare characters, stray symbols, Latin-1 soup, bopomofo and
 * small-form punctuation in Chinese, half-width katakana — scores low.
 *
 * Only non-ASCII characters are scored (ASCII is the same in every candidate).
 */

/** The most frequent Chinese characters (simplified and traditional), also common in Japanese kanji. */
const COMMON =
  '的一是不了人我在有他这中大来上个国到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长知民样现分将外但身些与高意进把法此实回二理美点月明其种声全工己话儿者向情部正名定女问力机给等几很业最间新什打便位因重被走电四第门相次东政海口使教西再平真听世气信北少关并内加化由却代军产入先山五太水万市眼体别处总才场师书比住员九笑性通目华报立马命张活难神数件安表原车白应路期叫死常提感金何更反合放做系计或司利受光王果亲界及今京务制解各任至清物台象记边共风战干接它许八特觉望直服毛林题建南度统色字请交爱让认算论百吃义科怎元社术结六功指思非流每青管夫连远资队跟带花快条院变联言权往展该领传近留红治决周保达办运武半候七必城父强步完革深区即求品士转量空甚众技轻程告江语英基派满式李息写呢识极令黄德收脸钱党倒未持取设始版双历越史商千片容研像找友孩站广改议形委早房音火际则首单据导影失拿网香似斯专石若兵弟谁校读志飞观争究包组造落视济喜离虽坐集编宝谈府拉黑且随格尽剑讲布杀微怕母调局根曾准团段终乐切级克精哪官示冷域孔吗险树怀低速支装守害健脑胜疑注易龙朋庆族寻兄胡银阿缺钟危顾充苦恐迎抱秋骑旁荣湖午尚积刻典宽狗盘梦宣曲圆鲜叶伤混佛圣借救惊顿宁迟毒恶渐丽娘测试检查修复可靠运营今日瓦兆电量场风' +
  '這個們來時說國對會學過還發後經與現麼動長進間點樣當實開問頭見機業種從將幾話兩應關無東車書門員難總區記統變師體電報華義網為裡邊條聽讓請認計論萬雙號歡錢錯鐘鬥齊龍風飛馬鳥魚愛處氣聲廣歲歷戰權觀齡讀識護傳價準層場導衛試題顯驗響練歸測檢復亂碼運營'
  // Japanese kanji common in everyday text, beyond the above.
  + '私何事時今日本語文字化修復検査試験読書週曜円駅様込頂払込済戻続紹介';

const COMMON_SET = new Set(COMMON);

/** Accented Latin letters count as real only next to other Latin letters. */
const isAsciiLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c);
const isLatinLetter = (c: string | undefined) => !!c && /\p{Script=Latin}/u.test(c);

/** For each character inside a Latin word: the share of that word's letters that are accented. */
function accentShare(chars: string[]): Float32Array {
  const share = new Float32Array(chars.length);
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    let accented = 0;
    for (let k = start; k < end; k++) if (chars[k].codePointAt(0)! >= 0x80) accented++;
    for (let k = start; k < end; k++) share[k] = accented / (end - start);
    start = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    if (/[\p{Script=Latin}\p{M}]/u.test(chars[i])) {
      if (start < 0) start = i;
    } else flush(i);
  }
  flush(chars.length);
  return share;
}

/** Space, ASCII punctuation or the edge of the text. */
const isPlainEdge = (c: string | undefined) => c === undefined || (c.codePointAt(0)! < 0x80 && !/[A-Za-z0-9]/.test(c));

/**
 * Letters that appear in many languages count more than letters used by only one small
 * language. This matters when two code pages differ only in those letters: Turkish
 * ş ğ ı İ (Windows-1254) and Icelandic þ ð ý Ý (Windows-1252) share the same bytes.
 */
const RARE_LATIN = new Set('þÞðÐýÝ');
const weight = (ch: string) => (RARE_LATIN.has(ch) ? 0.4 : 0.8);

/** The writing system of a letter, for spotting words that mix two alphabets (mojibake). */
function scriptOf(c: string | undefined): number {
  if (!c) return 0;
  const cp = c.codePointAt(0)!;
  if (cp < 0x80) return /[A-Za-z]/.test(c) ? 1 : 0;
  if ((cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7) || (cp >= 0x1e00 && cp <= 0x1eff)) return 1; // Latin
  if (cp >= 0x0370 && cp <= 0x03ff) return 2; // Greek
  if (cp >= 0x0400 && cp <= 0x052f) return 3; // Cyrillic
  if (cp >= 0x0590 && cp <= 0x05ff) return 4; // Hebrew
  if (cp >= 0x0600 && cp <= 0x06ff) return 5; // Arabic
  if (cp >= 0x0e00 && cp <= 0x0e7f) return 6; // Thai
  return 0;
}

/**
 * The everyday Cyrillic letters (Russian, Ukrainian, Bulgarian, Serbian…); ж ш щ ф х ц ъ э ю
 * are much rarer, and wrong-code-page Cyrillic is full of them.
 */
const CYR_COMMON = new Set('оеаинтсрвлкмдпуяыьгзбчйіїєёјљњћ');

/**
 * Modern Greek marks the stressed vowel of every word of two or more syllables (άέήίόύώ), so a
 * long lower-case Greek word with no accent at all is usually Hebrew/Arabic/Russian bytes read as Greek.
 */
function greekWithoutAccent(chars: string[]): Uint8Array {
  const flag = new Uint8Array(chars.length);
  let start = -1;
  const flush = (end: number) => {
    if (start >= 0 && end - start >= 4) {
      const word = chars.slice(start, end).join('');
      if (word === word.toLowerCase() && !/[άέήίόύώΐΰ]/.test(word)) flag.fill(1, start, end);
    }
    start = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    if (cp >= 0x0370 && cp <= 0x03ff && /\p{L}/u.test(chars[i])) {
      if (start < 0) start = i;
    } else flush(i);
  }
  flush(chars.length);
  return flag;
}

const lower = (c: string | undefined) => !!c && c !== c.toUpperCase() && c === c.toLowerCase();
const upper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();

export function plausibility(text: string): number {
  let sum = 0;
  let n = 0;
  const chars = [...text];
  const share = accentShare(chars);
  const bareGreek = greekWithoutAccent(chars);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) continue;
    n++;
    // A word that switches alphabet mid-way ("Zaїуіж", "PψνliΉ") is mojibake in any language.
    const sc = scriptOf(ch);
    if (sc && ((scriptOf(chars[i - 1]) || sc) !== sc || (scriptOf(chars[i + 1]) || sc) !== sc)) {
      sum -= 1.5;
      continue;
    }
    if (COMMON_SET.has(ch)) sum += 2;
    else if (cp >= 0x4e00 && cp <= 0x9fff) sum += 0; // other everyday Han: neutral
    else if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x2e80 && cp <= 0x2fdf)) sum -= 2; // rare Han, compatibility, radicals
    else if (cp >= 0x3041 && cp <= 0x30ff) sum += 1.5; // kana
    else if (cp >= 0xac00 && cp <= 0xd7a3) sum += 1.2; // Hangul syllables
    else if ((cp >= 0x3130 && cp <= 0x318f) || (cp >= 0x1100 && cp <= 0x11ff)) sum -= 1; // loose Hangul jamo
    else if (cp >= 0x3100 && cp <= 0x312f) sum -= 2; // bopomofo: rare inside text
    else if ((cp >= 0x3000 && cp <= 0x303f) || (cp >= 0xff01 && cp <= 0xff5e)) sum += 0.6; // CJK and full-width punctuation
    else if ((cp >= 0xfe10 && cp <= 0xfe6f) || (cp >= 0xff61 && cp <= 0xff9f)) sum -= 1.5; // small/vertical forms, half-width katakana
    else if (cp >= 0x0400 && cp <= 0x04ff) {
      // Cyrillic: lower-case letters dominate real text; a capital right after a small letter
      // ("тЕЪФ") is the mark of a KOI8 ↔ Windows-1251 mix-up.
      sum += upper(ch) && lower(chars[i - 1]) ? -1 : !lower(ch) ? 0.2 : CYR_COMMON.has(ch) ? 1.1 : 0.2;
    }
    else if ((cp >= 0x00c0 && cp <= 0x024f && cp !== 0x00d7 && cp !== 0x00f7) || (cp >= 0x1e00 && cp <= 0x1eff)) {
      // Accented Latin letters (French, German, Polish, Czech, Turkish, Vietnamese…) are real
      // inside words (café, Straße, łódź, Việt), noise when in clumps of symbols.
      // Real words are mostly plain letters with some accents (café 1/4, Zażółć 4/6); mojibake words
      // are almost all accented (Ïðèâåò, ÊÇÑÊ´ÕªÒ) or broken by symbols.
      const inWord = isLatinLetter(chars[i - 1]) || isLatinLetter(chars[i + 1]);
      const alone = !inWord && isPlainEdge(chars[i - 1]) && isPlainEdge(chars[i + 1]); // French "à", Spanish "é"
      sum += alone ? 0.3 : !inWord ? -1.2 : share[i] < 1 ? (share[i] <= 0.8 ? weight(ch) : 0) : -1.2;
      if (upper(ch) && lower(chars[i - 1])) sum -= 1; // capital in the middle of a word
    } else if (cp >= 0x0080 && cp <= 0x009f) sum -= 2; // C1 control characters: never in real text
    else if (cp >= 0x0370 && cp <= 0x1cff && /\p{L}|\p{M}/u.test(ch)) {
      // Other scripts (Greek, Hebrew, Arabic, Armenian, Thai, Devanagari and the other Indic scripts…):
      // real text has letters next to letters of the same script.
      const same = (c: string | undefined) => !!c && c.codePointAt(0)! >> 7 === cp >> 7 && /\p{L}|\p{M}/u.test(c);
      sum += !(same(chars[i - 1]) || same(chars[i + 1])) ? -0.3 : bareGreek[i] ? 0.4 : 1;
    } else if ((cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) sum += 0.5; // emoji, symbols
    else if (/[’‘“”—–…€•]/.test(ch)) sum += chars[i - 1] === ' ' || chars[i + 1] === ' ' || isAsciiLetter(chars[i - 1]) ? 0.3 : -1;
    else if ((cp >= 0x80 && cp <= 0xbf) || (cp >= 0x2000 && cp <= 0x206f) || cp === 0x02c6 || cp === 0x02dc) sum -= 1.2; // Latin-1 symbols, stray punctuation
    else if ((cp >= 0x2500 && cp <= 0x259f) || (cp >= 0xe000 && cp <= 0xf8ff) || cp === 0xfffd) sum -= 2; // box drawing, private use, lost
    else sum -= 0.5;
  }
  return n ? sum / n : 0;
}

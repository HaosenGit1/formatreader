# Sample accounting data files

Written for FormatReader (fictional companies and figures):
- `saft-windco.xml`: SAF-T Financial in the Norwegian 1.30 style (accounts with opening/closing,
  customers, two journal transactions with wrapped Amount values, header totals).
- `gbt24589-export.xml`: a Chinese accounting export organised by the GB/T 24589 data elements
  (科目编号, 科目名称, 期初/期末余额, 凭证日期, 凭证编号, 摘要, 借方/贷方金额). Real exports name
  their elements in different ways; the reader looks up several known names for each value.

import pandas as pd
import numpy as np

SHEET_ID = '1EcrOSVscUJ4G9pjn9955oo_rPQK-d4m260lloNc74Vg'
GID_BASE = '0'

def get_sheet_url(sheet_id, gid):
    return f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}'

print("Downloading base data...")
df = pd.read_csv(get_sheet_url(SHEET_ID, GID_BASE))

# Key difference:
# Notebook:      d5_above_ipo = (close_d5 > ipo_price).astype(int)
#   => When close_d5 is NaN: NaN > X => False => 0 (counted as "not above")
#
# Build script:  above = (p) => { if (p == null) return null; return p > ipo ? 1 : 0; }
#   => When close_d5 is null: returns null => filtered OUT of probMean

fa_mask = df['lead_underwriters_norm'].astype(str).str.contains('ฟินันเซีย', na=False)
rhb_mask = df['lead_underwriters_norm'].astype(str).str.contains('อาร์เอชบี', na=False)

for label, mask in [("ฟินันเซีย", fa_mask), ("อาร์เอชบี", rhb_mask)]:
    sub = df[mask][['symbol', 'ipo_price', 'close_d5']].copy()
    nan_count = sub['close_d5'].isna().sum()
    total = len(sub)

    # Notebook way: NaN => 0
    nb_d5 = (sub['close_d5'] > sub['ipo_price']).astype(int)
    nb_prob = nb_d5.mean() * 100

    # Build script way: NaN => excluded
    valid = sub.dropna(subset=['close_d5'])
    bs_d5 = (valid['close_d5'] > valid['ipo_price']).astype(int)
    bs_prob = bs_d5.mean() * 100 if len(valid) > 0 else 0

    print(f"\n=== {label} ===")
    print(f"Total IPOs: {total}, NaN close_d5: {nan_count}")
    print(f"Notebook  (NaN=0):       prob_close_d5 = {nb_prob:.4f}%  (denominator={total})")
    print(f"Build script (NaN skip): prob_close_d5 = {bs_prob:.4f}%  (denominator={len(valid)})")
    print(f"Difference: {bs_prob - nb_prob:.4f}%")

    # Show the NaN rows
    nan_rows = sub[sub['close_d5'].isna()]
    if len(nan_rows) > 0:
        print(f"\nIPOs with NaN close_d5:")
        for _, r in nan_rows.iterrows():
            print(f"  {r['symbol']}  ipo_price={r['ipo_price']}")

print("\n\n=== ROOT CAUSE ===")
print("Notebook:     NaN close_d5 => (NaN > X) = False => d5_above_ipo = 0 (counts as NEGATIVE)")
print("Build script: NaN close_d5 => null => EXCLUDED from probMean (not counted at all)")
print("Result: Notebook denominator is LARGER => probability is LOWER")

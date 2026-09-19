// Maps the 2-letter country code we already capture on every user (see
// maybeSetUserCountry in repo/users.ts, sourced from Cloudflare's
// cf-ipcountry header) to that country's calling code + flag -- lets the
// phone banner (PhoneNumberBanner.tsx) start the input already filled in
// with the right prefix instead of making someone look up and type their
// own country code. Deliberately not exhaustive -- covers Strivo's actual
// signup geography plus the most common countries generally; an
// unrecognized or missing country just leaves the field unprefixed rather
// than guessing wrong.
export const DIAL_CODE_BY_COUNTRY: Record<string, { dialCode: string; flag: string }> = {
  IN: { dialCode: "+91", flag: "🇮🇳" },
  US: { dialCode: "+1", flag: "🇺🇸" },
  CA: { dialCode: "+1", flag: "🇨🇦" },
  GB: { dialCode: "+44", flag: "🇬🇧" },
  AE: { dialCode: "+971", flag: "🇦🇪" },
  SG: { dialCode: "+65", flag: "🇸🇬" },
  AU: { dialCode: "+61", flag: "🇦🇺" },
  PK: { dialCode: "+92", flag: "🇵🇰" },
  BD: { dialCode: "+880", flag: "🇧🇩" },
  NP: { dialCode: "+977", flag: "🇳🇵" },
  LK: { dialCode: "+94", flag: "🇱🇰" },
  SA: { dialCode: "+966", flag: "🇸🇦" },
  DE: { dialCode: "+49", flag: "🇩🇪" },
  FR: { dialCode: "+33", flag: "🇫🇷" },
  ES: { dialCode: "+34", flag: "🇪🇸" },
  IT: { dialCode: "+39", flag: "🇮🇹" },
  NL: { dialCode: "+31", flag: "🇳🇱" },
  NG: { dialCode: "+234", flag: "🇳🇬" },
  ZA: { dialCode: "+27", flag: "🇿🇦" },
  PH: { dialCode: "+63", flag: "🇵🇭" },
  ID: { dialCode: "+62", flag: "🇮🇩" },
  MY: { dialCode: "+60", flag: "🇲🇾" },
  JP: { dialCode: "+81", flag: "🇯🇵" },
  KR: { dialCode: "+82", flag: "🇰🇷" },
  BR: { dialCode: "+55", flag: "🇧🇷" },
  MX: { dialCode: "+52", flag: "🇲🇽" },
  IE: { dialCode: "+353", flag: "🇮🇪" },
  NZ: { dialCode: "+64", flag: "🇳🇿" },
  KE: { dialCode: "+254", flag: "🇰🇪" },
  EG: { dialCode: "+20", flag: "🇪🇬" },
};

export function dialCodeForCountry(country: string | null): { dialCode: string; flag: string } | null {
  if (!country) return null;
  return DIAL_CODE_BY_COUNTRY[country.toUpperCase()] ?? null;
}

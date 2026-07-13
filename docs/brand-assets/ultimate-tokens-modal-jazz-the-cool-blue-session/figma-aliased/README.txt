figma-aliased/ — EXPERIMENTAL plugin-free cascade (OD-004)
==========================================================
Same tokens as ../figma/, but the Light/Dark variables carry com.figma.aliasData so they
ALIAS the raw primitives instead of embedding resolved colors — i.e. editing a Color
Primitive cascades to every semantic role, WITHOUT the Ultimate Tokens plugin.

This native-import path is UNVERIFIED end-to-end. The ../figma/ (resolved) files always
import cleanly; the Ultimate Tokens Figma plugin is the reliable cascade. Use this only to test
native import, and import the primitives FIRST.

To test (Figma → Local variables → Import):
  1. Import palette.tokens.json   → creates the "Color Primitives" collection.
  2. Import Light_tokens.json then Dark_tokens.json → creates "Color Modes".
  3. Open a semantic variable (e.g. primary). It should show as an ALIAS to a
     Color Primitives variable (not a flat color), and editing that primitive should
     update it. If it imports as resolved colors (no alias) or errors on import, the
     cascade did not resolve — use the plugin instead.

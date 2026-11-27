// outline FONT WEIGHT word...  -> JSON: per word, glyph paths (y down, 1000 units/em) with kerned advances
#include <CoreText/CoreText.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static double ox; static int first;
static void el(void *i, const CGPathElement *e) {
  const CGPoint *p = e->points;
  switch (e->type) {
    case kCGPathElementMoveToPoint: printf("M%.2f %.2f", p[0].x + ox, -p[0].y); break;
    case kCGPathElementAddLineToPoint: printf("L%.2f %.2f", p[0].x + ox, -p[0].y); break;
    case kCGPathElementAddQuadCurveToPoint: printf("Q%.2f %.2f %.2f %.2f", p[0].x + ox, -p[0].y, p[1].x + ox, -p[1].y); break;
    case kCGPathElementAddCurveToPoint: printf("C%.2f %.2f %.2f %.2f %.2f %.2f", p[0].x + ox, -p[0].y, p[1].x + ox, -p[1].y, p[2].x + ox, -p[2].y); break;
    case kCGPathElementCloseSubpath: printf("Z"); break;
  }
}
int main(int c, char **v) {
  CFURLRef u = CFURLCreateFromFileSystemRepresentation(0, (const UInt8 *)v[1], strlen(v[1]), false);
  CFArrayRef ds = CTFontManagerCreateFontDescriptorsFromURL(u);
  if (!ds || !CFArrayGetCount(ds)) { fprintf(stderr, "unreadable %s\n", v[1]); return 1; }
  CTFontRef f0 = CTFontCreateWithFontDescriptor(CFArrayGetValueAtIndex(ds, 0), 1000, NULL);
  int tag = 'wght'; double wv = atof(v[2]);
  CFNumberRef k = CFNumberCreate(0, kCFNumberIntType, &tag), w = CFNumberCreate(0, kCFNumberDoubleType, &wv);
  CFDictionaryRef var = CFDictionaryCreate(0, (const void **)&k, (const void **)&w, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  const void *ak[] = { kCTFontVariationAttribute }, *av[] = { var };
  CTFontDescriptorRef d = CTFontDescriptorCreateWithAttributes(CFDictionaryCreate(0, ak, av, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks));
  CTFontRef f = CTFontCreateCopyWithAttributes(f0, 1000, NULL, d);
  char nm[200]; CFStringGetCString(CTFontCopyFullName(f), nm, 200, kCFStringEncodingUTF8); fprintf(stderr, "%s asc %.0f xh %.0f cap %.0f\n", nm, CTFontGetAscent(f), CTFontGetXHeight(f), CTFontGetCapHeight(f));
  if (c < 4) return 0;
  printf("[");
  for (int i = 3; i < c; i++) {
    CFStringRef s = CFStringCreateWithCString(0, v[i], kCFStringEncodingUTF8);
    const void *tk[] = { kCTFontAttributeName }, *tv[] = { f };
    CTLineRef line = CTLineCreateWithAttributedString(CFAttributedStringCreate(0, s, CFDictionaryCreate(0, tk, tv, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks)));
    printf("%s{\"text\":\"%s\",\"adv\":%.2f,\"d\":\"", i > 3 ? "," : "", v[i], CTLineGetTypographicBounds(line, NULL, NULL, NULL));
    CFArrayRef runs = CTLineGetGlyphRuns(line);
    for (CFIndex r = 0; r < CFArrayGetCount(runs); r++) {
      CTRunRef run = CFArrayGetValueAtIndex(runs, r); CFIndex n = CTRunGetGlyphCount(run);
      CTFontRef rf = CFDictionaryGetValue(CTRunGetAttributes(run), kCTFontAttributeName);
      char rn[200]; CFStringGetCString(CTFontCopyFullName(rf), rn, 200, kCFStringEncodingUTF8); if (strcmp(rn, nm)) fprintf(stderr, "FALLBACK %s\n", rn);
      CGGlyph g[64]; CGPoint p[64]; CTRunGetGlyphs(run, CFRangeMake(0, n), g); CTRunGetPositions(run, CFRangeMake(0, n), p);
      for (CFIndex j = 0; j < n; j++) { CGPathRef path = CTFontCreatePathForGlyph(rf, g[j], NULL); ox = p[j].x; if (path) CGPathApply(path, NULL, el); }
    }
    printf("\"}");
  }
  printf("]\n"); return 0;
}

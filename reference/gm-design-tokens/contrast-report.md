# GM design tokens — Contrast report

Generated from `tokens.json`. Ratios shown to four decimals; pass/fail uses the unrounded number.

Required pairs: **196/196 pass**. Reference-only pairs: 24.

Normal text ≥ 4.5:1; required controls/graphics ≥ 3:1. Disabled text uses a voluntary project target of 4.5:1. Decorative borders are not input boundaries.

This is a token audit, not certification of a rendered application. Only the listed combinations are approved; custom opacity/gradients/overlays need another check.

Method: sRGB channels /255 → linear (c/12.92 if c ≤ 0.04045; otherwise ((c+0.055)/1.055)^2.4). L = 0.2126R + 0.7152G + 0.0722B. Contrast = (lighter L + 0.05)/(darker L + 0.05).

Sources: [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Required pairs

| Theme | Usage | Foreground | Background | Ratio | Minimum | Result |
|---|---|---|---|---:|---:|---|
| light | text/approved-surface-1 | #2D2A26 | #FAF8F3 | 13.4530:1 | 4.5:1 | PASS |
| light | text/approved-surface-2 | #2D2A26 | #FFFFFF | 14.2784:1 | 4.5:1 | PASS |
| light | text/approved-surface-3 | #2D2A26 | #F2F1EA | 12.6097:1 | 4.5:1 | PASS |
| light | text/approved-surface-4 | #2D2A26 | #EEF3E6 | 12.6454:1 | 4.5:1 | PASS |
| light | text/approved-surface-5 | #2D2A26 | #EAF2FA | 12.6328:1 | 4.5:1 | PASS |
| light | text/approved-surface-6 | #2D2A26 | #FFF4DE | 13.0865:1 | 4.5:1 | PASS |
| light | text/approved-surface-7 | #2D2A26 | #FAECE8 | 12.3938:1 | 4.5:1 | PASS |
| light | text/approved-surface-8 | #2D2A26 | #F3F4F6 | 12.9743:1 | 4.5:1 | PASS |
| light | text/approved-surface-9 | #2D2A26 | #FFF4DE | 13.0865:1 | 4.5:1 | PASS |
| light | text/approved-surface-10 | #2D2A26 | #F1EDFC | 12.4151:1 | 4.5:1 | PASS |
| light | text/approved-surface-11 | #2D2A26 | #EDF4E8 | 12.7190:1 | 4.5:1 | PASS |
| light | text/approved-surface-12 | #2D2A26 | #FAECE8 | 12.3938:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-1 | #6B6760 | #FAF8F3 | 5.2986:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-2 | #6B6760 | #FFFFFF | 5.6237:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-3 | #6B6760 | #F2F1EA | 4.9665:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-4 | #6B6760 | #EEF3E6 | 4.9806:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-5 | #6B6760 | #EAF2FA | 4.9756:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-6 | #6B6760 | #FFF4DE | 5.1543:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-7 | #6B6760 | #FAECE8 | 4.8815:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-8 | #6B6760 | #F3F4F6 | 5.1101:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-9 | #6B6760 | #FFF4DE | 5.1543:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-10 | #6B6760 | #F1EDFC | 4.8898:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-11 | #6B6760 | #EDF4E8 | 5.0095:1 | 4.5:1 | PASS |
| light | text-muted/approved-surface-12 | #6B6760 | #FAECE8 | 4.8815:1 | 4.5:1 | PASS |
| light | brand-fg/surface-1 | #49662C | #FAF8F3 | 6.1443:1 | 4.5:1 | PASS |
| light | brand-fg/surface-2 | #49662C | #FFFFFF | 6.5213:1 | 4.5:1 | PASS |
| light | brand-fg/surface-3 | #49662C | #F2F1EA | 5.7591:1 | 4.5:1 | PASS |
| light | brand-fg/surface-4 | #49662C | #EEF3E6 | 5.7755:1 | 4.5:1 | PASS |
| light | info-fg/surface-1 | #315F84 | #FAF8F3 | 6.3812:1 | 4.5:1 | PASS |
| light | info-fg/surface-2 | #315F84 | #FFFFFF | 6.7727:1 | 4.5:1 | PASS |
| light | info-fg/surface-3 | #315F84 | #F2F1EA | 5.9812:1 | 4.5:1 | PASS |
| light | info-fg/surface-4 | #315F84 | #EAF2FA | 5.9922:1 | 4.5:1 | PASS |
| light | warning-fg/surface-1 | #805719 | #FAF8F3 | 6.0046:1 | 4.5:1 | PASS |
| light | warning-fg/surface-2 | #805719 | #FFFFFF | 6.3730:1 | 4.5:1 | PASS |
| light | warning-fg/surface-3 | #805719 | #F2F1EA | 5.6282:1 | 4.5:1 | PASS |
| light | warning-fg/surface-4 | #805719 | #FFF4DE | 5.8410:1 | 4.5:1 | PASS |
| light | danger-fg/surface-1 | #895047 | #FAF8F3 | 5.9919:1 | 4.5:1 | PASS |
| light | danger-fg/surface-2 | #895047 | #FFFFFF | 6.3595:1 | 4.5:1 | PASS |
| light | danger-fg/surface-3 | #895047 | #F2F1EA | 5.6163:1 | 4.5:1 | PASS |
| light | danger-fg/surface-4 | #895047 | #FAECE8 | 5.5202:1 | 4.5:1 | PASS |
| light | status.queued.fg/bg | #5E626A | #F3F4F6 | 5.5614:1 | 4.5:1 | PASS |
| light | status.queued.fg/surface-1 | #5E626A | #FAF8F3 | 5.7666:1 | 4.5:1 | PASS |
| light | status.queued.fg/surface-2 | #5E626A | #FFFFFF | 6.1204:1 | 4.5:1 | PASS |
| light | status.queued.fg/surface-3 | #5E626A | #F2F1EA | 5.4051:1 | 4.5:1 | PASS |
| light | status.in_progress.fg/bg | #805719 | #FFF4DE | 5.8410:1 | 4.5:1 | PASS |
| light | status.in_progress.fg/surface-1 | #805719 | #FAF8F3 | 6.0046:1 | 4.5:1 | PASS |
| light | status.in_progress.fg/surface-2 | #805719 | #FFFFFF | 6.3730:1 | 4.5:1 | PASS |
| light | status.in_progress.fg/surface-3 | #805719 | #F2F1EA | 5.6282:1 | 4.5:1 | PASS |
| light | status.waiting.fg/bg | #605793 | #F1EDFC | 5.5636:1 | 4.5:1 | PASS |
| light | status.waiting.fg/surface-1 | #605793 | #FAF8F3 | 6.0287:1 | 4.5:1 | PASS |
| light | status.waiting.fg/surface-2 | #605793 | #FFFFFF | 6.3986:1 | 4.5:1 | PASS |
| light | status.waiting.fg/surface-3 | #605793 | #F2F1EA | 5.6508:1 | 4.5:1 | PASS |
| light | status.completed.fg/bg | #3F6B34 | #EDF4E8 | 5.5607:1 | 4.5:1 | PASS |
| light | status.completed.fg/surface-1 | #3F6B34 | #FAF8F3 | 5.8817:1 | 4.5:1 | PASS |
| light | status.completed.fg/surface-2 | #3F6B34 | #FFFFFF | 6.2425:1 | 4.5:1 | PASS |
| light | status.completed.fg/surface-3 | #3F6B34 | #F2F1EA | 5.5130:1 | 4.5:1 | PASS |
| light | status.cancelled.fg/bg | #895047 | #FAECE8 | 5.5202:1 | 4.5:1 | PASS |
| light | status.cancelled.fg/surface-1 | #895047 | #FAF8F3 | 5.9919:1 | 4.5:1 | PASS |
| light | status.cancelled.fg/surface-2 | #895047 | #FFFFFF | 6.3595:1 | 4.5:1 | PASS |
| light | status.cancelled.fg/surface-3 | #895047 | #F2F1EA | 5.6163:1 | 4.5:1 | PASS |
| light | on-brand/brand-solid | #FFFFFF | #577937 | 5.0055:1 | 4.5:1 | PASS |
| light | on-brand/brand-hover | #FFFFFF | #49662C | 6.5213:1 | 4.5:1 | PASS |
| light | on-brand/brand-active | #FFFFFF | #3E5725 | 8.0931:1 | 4.5:1 | PASS |
| light | on-danger/danger-solid | #FFFFFF | #895047 | 6.3595:1 | 4.5:1 | PASS |
| light | on-danger/danger-hover | #FFFFFF | #78433B | 7.8810:1 | 4.5:1 | PASS |
| light | on-danger/danger-active | #FFFFFF | #66372F | 9.7562:1 | 4.5:1 | PASS |
| light | on-info/info-solid | #FFFFFF | #315F84 | 6.7727:1 | 4.5:1 | PASS |
| light | disabled-fg/disabled-bg (project target) | #6B6760 | #ECEBE6 | 4.7112:1 | 4.5:1 | PASS |
| light | control-border/surface-1 | #87877F | #FAF8F3 | 3.4101:1 | 3:1 | PASS |
| light | control-border/surface-2 | #87877F | #FFFFFF | 3.6193:1 | 3:1 | PASS |
| light | control-border/surface-3 | #87877F | #F2F1EA | 3.1963:1 | 3:1 | PASS |
| light | focus/offset-surface-1 | #315F84 | #FAF8F3 | 6.3812:1 | 3:1 | PASS |
| light | focus/offset-surface-2 | #315F84 | #FFFFFF | 6.7727:1 | 3:1 | PASS |
| light | focus/offset-surface-3 | #315F84 | #F2F1EA | 5.9812:1 | 3:1 | PASS |
| light | focus/offset-surface-4 | #315F84 | #EEF3E6 | 5.9982:1 | 3:1 | PASS |
| light | focus/offset-surface-5 | #315F84 | #EAF2FA | 5.9922:1 | 3:1 | PASS |
| light | focus/offset-surface-6 | #315F84 | #FFF4DE | 6.2074:1 | 3:1 | PASS |
| light | focus/offset-surface-7 | #315F84 | #FAECE8 | 5.8788:1 | 3:1 | PASS |
| light | focus/offset-surface-8 | #315F84 | #F3F4F6 | 6.1542:1 | 3:1 | PASS |
| light | focus/offset-surface-9 | #315F84 | #FFF4DE | 6.2074:1 | 3:1 | PASS |
| light | focus/offset-surface-10 | #315F84 | #F1EDFC | 5.8889:1 | 3:1 | PASS |
| light | focus/offset-surface-11 | #315F84 | #EDF4E8 | 6.0330:1 | 3:1 | PASS |
| light | focus/offset-surface-12 | #315F84 | #FAECE8 | 5.8788:1 | 3:1 | PASS |
| light | progress-fill/track | #315F84 | #E5E7DE | 5.4236:1 | 3:1 | PASS |
| light | chart-outline/queued-fill | #2D2A26 | #8A8F98 | 4.3944:1 | 3:1 | PASS |
| light | chart-outline/in_progress-fill | #2D2A26 | #E3A03A | 6.3611:1 | 3:1 | PASS |
| light | chart-outline/waiting-fill | #2D2A26 | #8B7FD1 | 4.1164:1 | 3:1 | PASS |
| light | chart-outline/completed-fill | #2D2A26 | #5E9B4F | 4.2681:1 | 3:1 | PASS |
| light | chart-outline/cancelled-fill | #2D2A26 | #C97B70 | 4.4540:1 | 3:1 | PASS |
| light | chart-outline/surface-1 | #2D2A26 | #FAF8F3 | 13.4530:1 | 3:1 | PASS |
| light | chart-outline/surface-2 | #2D2A26 | #FFFFFF | 14.2784:1 | 3:1 | PASS |
| light | chart-outline/surface-3 | #2D2A26 | #F2F1EA | 12.6097:1 | 3:1 | PASS |
| dark | text/approved-surface-1 | #F4F1E9 | #181C17 | 15.2840:1 | 4.5:1 | PASS |
| dark | text/approved-surface-2 | #F4F1E9 | #22271F | 13.5016:1 | 4.5:1 | PASS |
| dark | text/approved-surface-3 | #F4F1E9 | #2D332A | 11.4951:1 | 4.5:1 | PASS |
| dark | text/approved-surface-4 | #F4F1E9 | #2B3B22 | 10.6231:1 | 4.5:1 | PASS |
| dark | text/approved-surface-5 | #F4F1E9 | #223649 | 10.9968:1 | 4.5:1 | PASS |
| dark | text/approved-surface-6 | #F4F1E9 | #3B2D19 | 11.8103:1 | 4.5:1 | PASS |
| dark | text/approved-surface-7 | #F4F1E9 | #422D29 | 11.3515:1 | 4.5:1 | PASS |
| dark | text/approved-surface-8 | #F4F1E9 | #30343C | 11.0607:1 | 4.5:1 | PASS |
| dark | text/approved-surface-9 | #F4F1E9 | #3B2D19 | 11.8103:1 | 4.5:1 | PASS |
| dark | text/approved-surface-10 | #F4F1E9 | #342D48 | 11.5208:1 | 4.5:1 | PASS |
| dark | text/approved-surface-11 | #F4F1E9 | #283B23 | 10.6923:1 | 4.5:1 | PASS |
| dark | text/approved-surface-12 | #F4F1E9 | #422D29 | 11.3515:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-1 | #BEBFAF | #181C17 | 9.2505:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-2 | #BEBFAF | #22271F | 8.1718:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-3 | #BEBFAF | #2D332A | 6.9574:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-4 | #BEBFAF | #2B3B22 | 6.4296:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-5 | #BEBFAF | #223649 | 6.6557:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-6 | #BEBFAF | #3B2D19 | 7.1481:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-7 | #BEBFAF | #422D29 | 6.8704:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-8 | #BEBFAF | #30343C | 6.6944:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-9 | #BEBFAF | #3B2D19 | 7.1481:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-10 | #BEBFAF | #342D48 | 6.9729:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-11 | #BEBFAF | #283B23 | 6.4714:1 | 4.5:1 | PASS |
| dark | text-muted/approved-surface-12 | #BEBFAF | #422D29 | 6.8704:1 | 4.5:1 | PASS |
| dark | brand-fg/surface-1 | #C1DCA5 | #181C17 | 11.5403:1 | 4.5:1 | PASS |
| dark | brand-fg/surface-2 | #C1DCA5 | #22271F | 10.1945:1 | 4.5:1 | PASS |
| dark | brand-fg/surface-3 | #C1DCA5 | #2D332A | 8.6795:1 | 4.5:1 | PASS |
| dark | brand-fg/surface-4 | #C1DCA5 | #2B3B22 | 8.0211:1 | 4.5:1 | PASS |
| dark | info-fg/surface-1 | #A8D3F5 | #181C17 | 10.9267:1 | 4.5:1 | PASS |
| dark | info-fg/surface-2 | #A8D3F5 | #22271F | 9.6525:1 | 4.5:1 | PASS |
| dark | info-fg/surface-3 | #A8D3F5 | #2D332A | 8.2180:1 | 4.5:1 | PASS |
| dark | info-fg/surface-4 | #A8D3F5 | #223649 | 7.8617:1 | 4.5:1 | PASS |
| dark | warning-fg/surface-1 | #FFD38C | #181C17 | 12.2798:1 | 4.5:1 | PASS |
| dark | warning-fg/surface-2 | #FFD38C | #22271F | 10.8478:1 | 4.5:1 | PASS |
| dark | warning-fg/surface-3 | #FFD38C | #2D332A | 9.2357:1 | 4.5:1 | PASS |
| dark | warning-fg/surface-4 | #FFD38C | #3B2D19 | 9.4889:1 | 4.5:1 | PASS |
| dark | danger-fg/surface-1 | #F2BAB0 | #181C17 | 10.2077:1 | 4.5:1 | PASS |
| dark | danger-fg/surface-2 | #F2BAB0 | #22271F | 9.0173:1 | 4.5:1 | PASS |
| dark | danger-fg/surface-3 | #F2BAB0 | #2D332A | 7.6772:1 | 4.5:1 | PASS |
| dark | danger-fg/surface-4 | #F2BAB0 | #422D29 | 7.5813:1 | 4.5:1 | PASS |
| dark | status.queued.fg/bg | #CDD1D9 | #30343C | 8.1552:1 | 4.5:1 | PASS |
| dark | status.queued.fg/surface-1 | #CDD1D9 | #181C17 | 11.2691:1 | 4.5:1 | PASS |
| dark | status.queued.fg/surface-2 | #CDD1D9 | #22271F | 9.9549:1 | 4.5:1 | PASS |
| dark | status.queued.fg/surface-3 | #CDD1D9 | #2D332A | 8.4755:1 | 4.5:1 | PASS |
| dark | status.in_progress.fg/bg | #FFD38C | #3B2D19 | 9.4889:1 | 4.5:1 | PASS |
| dark | status.in_progress.fg/surface-1 | #FFD38C | #181C17 | 12.2798:1 | 4.5:1 | PASS |
| dark | status.in_progress.fg/surface-2 | #FFD38C | #22271F | 10.8478:1 | 4.5:1 | PASS |
| dark | status.in_progress.fg/surface-3 | #FFD38C | #2D332A | 9.2357:1 | 4.5:1 | PASS |
| dark | status.waiting.fg/bg | #D4C6FF | #342D48 | 8.2486:1 | 4.5:1 | PASS |
| dark | status.waiting.fg/surface-1 | #D4C6FF | #181C17 | 10.9430:1 | 4.5:1 | PASS |
| dark | status.waiting.fg/surface-2 | #D4C6FF | #22271F | 9.6669:1 | 4.5:1 | PASS |
| dark | status.waiting.fg/surface-3 | #D4C6FF | #2D332A | 8.2303:1 | 4.5:1 | PASS |
| dark | status.completed.fg/bg | #B7D8A4 | #283B23 | 7.6846:1 | 4.5:1 | PASS |
| dark | status.completed.fg/surface-1 | #B7D8A4 | #181C17 | 10.9848:1 | 4.5:1 | PASS |
| dark | status.completed.fg/surface-2 | #B7D8A4 | #22271F | 9.7038:1 | 4.5:1 | PASS |
| dark | status.completed.fg/surface-3 | #B7D8A4 | #2D332A | 8.2617:1 | 4.5:1 | PASS |
| dark | status.cancelled.fg/bg | #F2BAB0 | #422D29 | 7.5813:1 | 4.5:1 | PASS |
| dark | status.cancelled.fg/surface-1 | #F2BAB0 | #181C17 | 10.2077:1 | 4.5:1 | PASS |
| dark | status.cancelled.fg/surface-2 | #F2BAB0 | #22271F | 9.0173:1 | 4.5:1 | PASS |
| dark | status.cancelled.fg/surface-3 | #F2BAB0 | #2D332A | 7.6772:1 | 4.5:1 | PASS |
| dark | on-brand/brand-solid | #1A2813 | #ACCA8B | 8.5310:1 | 4.5:1 | PASS |
| dark | on-brand/brand-hover | #1A2813 | #BDDA9C | 10.0766:1 | 4.5:1 | PASS |
| dark | on-brand/brand-active | #1A2813 | #CBE4B0 | 11.2493:1 | 4.5:1 | PASS |
| dark | on-danger/danger-solid | #36211D | #F2BAB0 | 8.9258:1 | 4.5:1 | PASS |
| dark | on-danger/danger-hover | #36211D | #F8CDC5 | 10.4372:1 | 4.5:1 | PASS |
| dark | on-danger/danger-active | #36211D | #FCDED8 | 11.9091:1 | 4.5:1 | PASS |
| dark | on-info/info-solid | #142534 | #A8D3F5 | 9.8970:1 | 4.5:1 | PASS |
| dark | disabled-fg/disabled-bg (project target) | #BEBFAF | #343A30 | 6.2772:1 | 4.5:1 | PASS |
| dark | control-border/surface-1 | #87917E | #181C17 | 5.2424:1 | 3:1 | PASS |
| dark | control-border/surface-2 | #87917E | #22271F | 4.6310:1 | 3:1 | PASS |
| dark | control-border/surface-3 | #87917E | #2D332A | 3.9428:1 | 3:1 | PASS |
| dark | focus/offset-surface-1 | #A8D3F5 | #181C17 | 10.9267:1 | 3:1 | PASS |
| dark | focus/offset-surface-2 | #A8D3F5 | #22271F | 9.6525:1 | 3:1 | PASS |
| dark | focus/offset-surface-3 | #A8D3F5 | #2D332A | 8.2180:1 | 3:1 | PASS |
| dark | focus/offset-surface-4 | #A8D3F5 | #2B3B22 | 7.5946:1 | 3:1 | PASS |
| dark | focus/offset-surface-5 | #A8D3F5 | #223649 | 7.8617:1 | 3:1 | PASS |
| dark | focus/offset-surface-6 | #A8D3F5 | #3B2D19 | 8.4433:1 | 3:1 | PASS |
| dark | focus/offset-surface-7 | #A8D3F5 | #422D29 | 8.1153:1 | 3:1 | PASS |
| dark | focus/offset-surface-8 | #A8D3F5 | #30343C | 7.9074:1 | 3:1 | PASS |
| dark | focus/offset-surface-9 | #A8D3F5 | #3B2D19 | 8.4433:1 | 3:1 | PASS |
| dark | focus/offset-surface-10 | #A8D3F5 | #342D48 | 8.2363:1 | 3:1 | PASS |
| dark | focus/offset-surface-11 | #A8D3F5 | #283B23 | 7.6440:1 | 3:1 | PASS |
| dark | focus/offset-surface-12 | #A8D3F5 | #422D29 | 8.1153:1 | 3:1 | PASS |
| dark | progress-fill/track | #A8D3F5 | #424A3D | 5.8376:1 | 3:1 | PASS |
| dark | chart-outline/queued-fill | #181C17 | #8A8F98 | 5.3093:1 | 3:1 | PASS |
| dark | chart-outline/in_progress-fill | #181C17 | #E3A03A | 7.6855:1 | 3:1 | PASS |
| dark | chart-outline/waiting-fill | #181C17 | #8B7FD1 | 4.9734:1 | 3:1 | PASS |
| dark | chart-outline/completed-fill | #181C17 | #5E9B4F | 5.1568:1 | 3:1 | PASS |
| dark | chart-outline/cancelled-fill | #181C17 | #C97B70 | 5.3812:1 | 3:1 | PASS |
| dark | chart.queued.base/dark-surface-1 | #8A8F98 | #181C17 | 5.3093:1 | 3:1 | PASS |
| dark | chart.queued.base/dark-surface-2 | #8A8F98 | #22271F | 4.6901:1 | 3:1 | PASS |
| dark | chart.queued.base/dark-surface-3 | #8A8F98 | #2D332A | 3.9931:1 | 3:1 | PASS |
| dark | chart.in_progress.base/dark-surface-1 | #E3A03A | #181C17 | 7.6855:1 | 3:1 | PASS |
| dark | chart.in_progress.base/dark-surface-2 | #E3A03A | #22271F | 6.7892:1 | 3:1 | PASS |
| dark | chart.in_progress.base/dark-surface-3 | #E3A03A | #2D332A | 5.7803:1 | 3:1 | PASS |
| dark | chart.waiting.base/dark-surface-1 | #8B7FD1 | #181C17 | 4.9734:1 | 3:1 | PASS |
| dark | chart.waiting.base/dark-surface-2 | #8B7FD1 | #22271F | 4.3935:1 | 3:1 | PASS |
| dark | chart.waiting.base/dark-surface-3 | #8B7FD1 | #2D332A | 3.7405:1 | 3:1 | PASS |
| dark | chart.completed.base/dark-surface-1 | #5E9B4F | #181C17 | 5.1568:1 | 3:1 | PASS |
| dark | chart.completed.base/dark-surface-2 | #5E9B4F | #22271F | 4.5554:1 | 3:1 | PASS |
| dark | chart.completed.base/dark-surface-3 | #5E9B4F | #2D332A | 3.8784:1 | 3:1 | PASS |
| dark | chart.cancelled.base/dark-surface-1 | #C97B70 | #181C17 | 5.3812:1 | 3:1 | PASS |
| dark | chart.cancelled.base/dark-surface-2 | #C97B70 | #22271F | 4.7537:1 | 3:1 | PASS |
| dark | chart.cancelled.base/dark-surface-3 | #C97B70 | #2D332A | 4.0473:1 | 3:1 | PASS |

## Original colors — reference only, failures retained

| Theme | Usage | Foreground | Background | Ratio | Minimum | Result |
|---|---|---|---|---:|---:|---|
| original | brand-base/white text | #5B7F3A | #FFFFFF | 4.6238:1 | 4.5:1 | PASS |
| original | brand-base/white essential graphic | #5B7F3A | #FFFFFF | 4.6238:1 | 3:1 | PASS |
| original | brand-base/cream text | #5B7F3A | #FAF8F3 | 4.3565:1 | 4.5:1 | FAIL |
| original | brand-base/cream essential graphic | #5B7F3A | #FAF8F3 | 4.3565:1 | 3:1 | PASS |
| original | queued/white text | #8A8F98 | #FFFFFF | 3.2492:1 | 4.5:1 | FAIL |
| original | queued/white essential graphic | #8A8F98 | #FFFFFF | 3.2492:1 | 3:1 | PASS |
| original | queued/cream text | #8A8F98 | #FAF8F3 | 3.0614:1 | 4.5:1 | FAIL |
| original | queued/cream essential graphic | #8A8F98 | #FAF8F3 | 3.0614:1 | 3:1 | PASS |
| original | in_progress/white text | #E3A03A | #FFFFFF | 2.2446:1 | 4.5:1 | FAIL |
| original | in_progress/white essential graphic | #E3A03A | #FFFFFF | 2.2446:1 | 3:1 | FAIL |
| original | in_progress/cream text | #E3A03A | #FAF8F3 | 2.1149:1 | 4.5:1 | FAIL |
| original | in_progress/cream essential graphic | #E3A03A | #FAF8F3 | 2.1149:1 | 3:1 | FAIL |
| original | waiting/white text | #8B7FD1 | #FFFFFF | 3.4686:1 | 4.5:1 | FAIL |
| original | waiting/white essential graphic | #8B7FD1 | #FFFFFF | 3.4686:1 | 3:1 | PASS |
| original | waiting/cream text | #8B7FD1 | #FAF8F3 | 3.2681:1 | 4.5:1 | FAIL |
| original | waiting/cream essential graphic | #8B7FD1 | #FAF8F3 | 3.2681:1 | 3:1 | PASS |
| original | completed/white text | #5E9B4F | #FFFFFF | 3.3453:1 | 4.5:1 | FAIL |
| original | completed/white essential graphic | #5E9B4F | #FFFFFF | 3.3453:1 | 3:1 | PASS |
| original | completed/cream text | #5E9B4F | #FAF8F3 | 3.1519:1 | 4.5:1 | FAIL |
| original | completed/cream essential graphic | #5E9B4F | #FAF8F3 | 3.1519:1 | 3:1 | PASS |
| original | cancelled/white text | #C97B70 | #FFFFFF | 3.2058:1 | 4.5:1 | FAIL |
| original | cancelled/white essential graphic | #C97B70 | #FFFFFF | 3.2058:1 | 3:1 | PASS |
| original | cancelled/cream text | #C97B70 | #FAF8F3 | 3.0205:1 | 4.5:1 | FAIL |
| original | cancelled/cream essential graphic | #C97B70 | #FAF8F3 | 3.0205:1 | 3:1 | PASS |

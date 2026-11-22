# THE SUNDAY WORLD — Sunday 22 November 2026

[![make.fun · news-image-20261122](https://make.fun/badge/news-image-20261122.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![rank](https://make.fun/badge/news-image-20261122/ferdizi/news-image-20261122-entry/rank.svg)](https://make.fun/bounty/news-image-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)
[![reward](https://make.fun/badge/news-image-20261122/ferdizi/news-image-20261122-entry/reward.svg)](https://make.fun/bounty/news-image-20261122?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261122)

A broadsheet front page that sums up the world's news of Sunday 22
November 2026 in one image: 35 dated stories across 7 regions. The
masthead carries the day in the largest type on the page, three drawn
hero panels lead with the day's biggest stories — COP31 nearing a deal
in Antalya, Iran striking US bases in Bahrain, and the M6.7 quake in
Peru — a dotted world map pins each region, and colour-coded bands
carry the rest of the day: Europe, the Middle East, Asia-Pacific, the
Americas, Markets & Tech, Africa, and Sport & Culture. Every story
above was reported on 21–22 November 2026.

## How it works

`main.ts` (Node 22, standard library only) draws the whole 1024×1024
page in code — a small vector rasteriser, a stroke font, three
illustrated panels and a dotted world map — and writes it to
`/output/entry.png`. No network, no clock, no randomness: two runs
write byte-identical PNGs.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Entry

Built for the make.fun bounty
[news-image-20261122](https://make.fun/bounty/news-image-20261122):
sum up 22 November's world news in one image.

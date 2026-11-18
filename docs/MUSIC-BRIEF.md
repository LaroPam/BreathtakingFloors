# Музыка для Suno: задание

Сейчас музыка в игре синтезируется кодом (по настроению на место, слоями по накалу боя), босс играет одну
свободную запись (CC0). Нужна живая музыка: по треку на каждое место, бой с боссом, финал и меню. Звуки ударов и
короткие мелодии-стингеры (новый уровень, эволюция, появление босса, победа, смерть) я делаю сам в коде: в Suno
короткое получается плохо.

## Как игра будет её играть

Музыка места нарастает вместе с волной: тишина → волна → огонь растёт → пик → босс. Есть два пути, выбери по
тому, что умеет твой Suno.

- **Путь А, дорожки (лучше).** Если Suno отдаёт трек разложенным на дорожки (stems: ударные, бас, остальное), пришли
  их. Игра включает их по очереди: в тишине только подложка, с волной входят бас и ударные, на пике всё сразу.
- **Путь Б, один трек.** Если дорожек нет, пришли просто трек. Игра сделает нарастание сама: в тишине трек
  приглушён и как будто за стеной (срезаны высокие), с волной открывается, на пике к нему добавляются мои
  синтезированные ударные в его темпе.

В обоих случаях трек играет по кругу, поэтому важно:
- **без голоса** (в Suno включи Instrumental);
- **без вступления и концовки**: с первой секунды по последнюю — одно и то же движение (я сам вырежу кусок
  ровно по тактам и склею в бесшовный круг);
- **ровный темп** на весь трек, без замедлений и ускорений;
- длина 1,5–3 минуты.

## Треки

Темп и лад — как у нынешней синтезированной музыки этих мест, чтобы игра звучала узнаваемо. Описание стиля — то,
что вставлять в Suno в поле стиля (Style). Если Suno уходит не туда, меняй прилагательные, а темп и
«instrumental, no vocals, loop» оставляй.

| № | Файл | Где играет | Настроение | Темп, лад |
|---|---|---|---|---|
| 1 | `menu` | меню, выбор героя | тихо, фонарь во тьме, грусть и надежда | 80, ля минор |
| 2 | `crypt` | Склеп (уровень I) | мрачный ритм, камень, свечи | 100, ля минор |
| 3 | `garden` | Забытый сад (II) | тепло, заросли, светлячки, тревога под листвой | 92, ре дорийский |
| 4 | `cistern` | Затопленные катакомбы (II, ветка) | под водой, медленно, капли, глухо | 80, ре минор |
| 5 | `frost` | Ледяные залы (III) | холод, колокольчики, звенящий лёд | 84, ми фригийский |
| 6 | `ashen` | Пепельная кузня (III, ветка) | молоты, жар, мехи, тяжело и упрямо | 108, соль минор |
| 7 | `heart` | Сердце башни (IV) | торжественно, орган, хор, близость конца | 96, си мажор |
| 8 | `beyond` | За светом (финал) | неземное, тишина после бури, свет | 72, ми мажор |
| 9 | `boss` | бои с боссами | быстро, напор, эпика | 118–128, до минор |
| 10 | `lastlight` | Последний Свет (финальный босс) | величие, хор, орган, отчаяние и свет | 120, си минор |

### Описания стиля для Suno

1. **menu**: `dark fantasy, lonely lantern in the dark, soft piano and harp, warm low strings, distant choir pad,
   melancholic and hopeful, slow, 80 bpm, A minor, instrumental, no vocals, seamless loop, no intro, no outro`
2. **crypt**: `dark fantasy dungeon crawler soundtrack, ancient crypt, pulsing low strings, harpsichord arpeggio,
   muffled taiko, deep choir pad, tense steady groove, 100 bpm, A minor, instrumental, no vocals, seamless loop,
   no intro, no outro`
3. **garden**: `dark fantasy, overgrown forgotten garden, kalimba and plucked harp arpeggios, breathy flute, soft hand
   percussion, warm but uneasy, 92 bpm, D dorian, instrumental, no vocals, seamless loop, no intro, no outro`
4. **cistern**: `dark fantasy, flooded catacombs, underwater ambient pads, slow dripping percussion, muffled bass,
   glassy bells far away, deep and calm, 80 bpm, D minor, instrumental, no vocals, seamless loop, no intro,
   no outro`
5. **frost**: `dark fantasy, frozen halls, celesta and glass bells, cold shimmering pads, sparse low drums, ringing
   ice, 84 bpm, E phrygian, instrumental, no vocals, seamless loop, no intro, no outro`
6. **ashen**: `dark fantasy, ashen forge, anvil hits as percussion, heavy low brass, driving bass like bellows,
   crackling embers, relentless, 108 bpm, G minor, instrumental, no vocals, seamless loop, no intro, no outro`
7. **heart**: `dark fantasy, heart of the tower, solemn pipe organ, wordless choir, tolling bells, slow build,
   grand and sacred, 96 bpm, B major, instrumental, no vocals, seamless loop, no intro, no outro`
8. **beyond**: `ethereal ambient, beyond the light, airy pads, soft piano, shimmering high strings, calm after the
   storm, 72 bpm, E major, instrumental, no vocals, seamless loop, no intro, no outro`
9. **boss**: `epic dark fantasy boss battle, fast driving drums, aggressive staccato strings, low brass stabs,
   choir hits, 124 bpm, C minor, instrumental, no vocals, seamless loop, no intro, no outro`
10. **lastlight**: `epic dark fantasy final boss, massive pipe organ, full choir, thundering drums, soaring strings,
    desperate and radiant, 120 bpm, B minor, instrumental, no vocals, seamless loop, no intro, no outro`

## Как прислать

- Лучше **WAV** (или MP3 320). Имя файла — как в столбце «Файл» (`crypt.wav`, а дорожки: `crypt-drums.wav`,
  `crypt-bass.wav`, `crypt-other.wav`).
- Можно по одному: начни с `crypt` и `boss`, я встрою их первыми, ты послушаешь в игре, и по ним поймём, что
  поправить в остальных.
- Я переведу в OGG (лёгкий для браузера), вырежу бесшовный круг, выровняю громкость и встрою. Тяжёлые треки
  грузятся в фоне, первым — только трек первого места.

## Права

Проверь в своём тарифе Suno, разрешено ли использовать треки в коммерческой игре (на бесплатном тарифе обычно
нельзя). Я запишу источник и условия в `art/music/README.md`, как с нынешним треком босса.

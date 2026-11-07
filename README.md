# Breathtaking Floors

Пиксельный рогалик для браузера: один из шести героев со своим светом спускается по девяти этажам башни через
три биома. В руках одно из десяти видов оружия, его можно сменить на алтаре, глубже попадается стихийное.
Орда как в Vampire Survivors, вес удара и комбо как в Hades, пули как в Enter the Gungeon. И три своих механики:
**свет как территория** (жаровни, призраки уязвимы только в свете), **клинок против пуль и граз** (разрубленные
пули и пролёт сквозь них заряжают Выброс) и **реакции стихий** (огонь + гроза = взрыв, лёд + гроза = раскол, …).

Вся графика сделана кодом: эффекты и существа взяты из [pixelfx](https://github.com/patch-gg/pixelfx), шесть героев
— свои модели на 3D-скелете из той же библиотеки (у каждого свой вид, оружие, способность и характеристики), звук
синтезируется. Площадки: **Яндекс Игры** и **YouTube Playables**.

- [Дизайн-документ](docs/GDD.md): концепция, что взято у других и что добавлено, цикл, контент, дорожная карта.
- [Технологии](docs/TECH.md): почему TypeScript + WebGL2, а не Rust; как устроен рендер; требования площадок.
- [Выпуск](docs/RELEASE.md): как подготовить сборки к модерации Яндекса и YouTube, что проверяют скрипты и что руками.

## Шрифты

Все три шрифта открытые, с латиницей и кириллицей. Лежат в `art/fonts` вместе с лицензиями; при сборке они
растрируются в атлас в родном пиксельном размере (`tools/bake/font.mjs`, `tools/bake/ttf.mjs`).

| Где | Шрифт | Автор | Лицензия |
|---|---|---|---|
| заголовки, имена героев и боссов | [Fantasy Warrior](https://burpyfresh.itch.io/fantasy-warrior), 11 px | Douglas Vautour (Burpy Fresh) | CC BY 4.0 |
| основной текст | [Pixeloid Sans](https://ggbot.itch.io/pixeloid-font), 9 px | GGBotNet | SIL OFL 1.1 |
| мелкие подписи | [Tiny5](https://github.com/Gissio/font_tiny5), 8 px | The Tiny5 Project Authors | SIL OFL 1.1 |

"Fantasy Warrior Font" by Douglas Vautour (Burpy Fresh) is licensed under CC-BY 4.0. Строка с авторами шрифтов
есть и в самой игре, внизу титульного экрана.

## Запуск

Нужен Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Откройте http://localhost:5173. Команда `dev` сначала запекает атлас (около 5 секунд), потом запускает Vite.

## Сборки

```bash
npm run build:single
```

Собирает всю игру в один файл `dist-single/breathtaking-floors.html` (около 5 МБ, графика внутри).
Его можно открыть двойным щелчком без сервера или переслать кому-нибудь.

```bash
npm run build:yandex
```

```bash
npm run build:youtube
```

Каждая сборка кладёт в корень архив (`dist-yandex.zip`, `dist-youtube.zip`) с `index.html` внутри. Его и
загружают в консоль разработчика. Перед загрузкой прогоните проверки из [docs/RELEASE.md](docs/RELEASE.md):
`npm run check:release` (файлы и подключение SDK) и `npm run check:sdk` (поведение в браузере с подставными SDK). `npm run build` собирает обычную веб-страницу в `dist/`.

## Графика

```bash
npm run bake -- --preview
```

Запекает атлас и пишет страницы для просмотра в `records/`. Чтобы добавить анимацию, впишите её в
`tools/bake/manifest.mjs`: эффект pixelfx (`fx: "fire/torch"`), свой эффект (`art: "shots/orb"`) или позы
героя (`rig: [...]`).

```bash
npm run art -- shots/orb --zoom 6
```

Рендерит лист кадров собственного эффекта из `art/fx` в `records/art/`. Для эффектов библиотеки то же самое
делает `npm run fx -- fire/brazier`.

В `.claude/skills/pixelfx` установлен навык pixelfx для Claude Code: попросите Claude сделать новый эффект,
и он пройдёт цикл «черновик → рендер → посмотреть → исправить».

## Лицензии

Код игры — MIT. В `pixelfx/` лежит копия библиотеки pixelfx (MIT, © Patch и Hugo Duprez, см.
`pixelfx/LICENSE` и `pixelfx/NOTICE.md`). Шрифт Patch Pixel в копию не включён.

// ← ЄДИНЕ місце, яке треба змінити під свій репозиторій.
const CH_REPO = {
  user: "Clinhfist", // ваш логін на GitHub
  repo: "js_test",          // назва репозиторію з сайтом
  ref: "main",              // гілка, тег (напр. "v1.0") або хеш коміту
  dir: "data"               // папка з JSON-файлами
};

const CH_BASE =
  `https://raw.githubusercontent.com/${CH_REPO.user}/${CH_REPO.repo}/${CH_REPO.ref}/${CH_REPO.dir}/`;

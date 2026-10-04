// Проверки кода: npm run check. Только то, что почти всегда ошибка: имя без импорта, присваивание
// импортированной переменной, неиспользуемые импорты и переменные.
import globals from 'globals';

export default [
  {
    files: ['src/app/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
];

module.exports = {
  root: true,
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  extends: ['standard-with-typescript'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  ignorePatterns: ['dist']
};

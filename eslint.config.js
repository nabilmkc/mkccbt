import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'api/_server.cjs'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];

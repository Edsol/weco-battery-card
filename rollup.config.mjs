import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/weco_battery.ts',
  output: {
    file: 'weco_battery.js',
    format: 'es',
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
  ],
};

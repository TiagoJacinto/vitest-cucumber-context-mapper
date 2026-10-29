declare module 'parsecurrency' {
  export default function parseCurrency(text: string): null | { raw: string; value: number; currency: string; symbol: string };
}

import { TextStyle } from 'react-native';

export const typography = {
  h1: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, color: '#e2e8f0' } as TextStyle,
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: '#e2e8f0' } as TextStyle,
  h3: { fontSize: 18, fontWeight: '600', color: '#e2e8f0' } as TextStyle,
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20, color: '#e2e8f0' } as TextStyle,
  caption: { fontSize: 12, fontWeight: '500', color: 'rgba(226,232,240,0.6)' } as TextStyle,
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(226,232,240,0.6)' } as TextStyle,
};

module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  transformIgnorePatterns: ['node_modules/(?!(?:@react-native|react-native|@testing-library)/)'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/__tests__/**']
}

// Complète app.json selon l'URL de l'API visée par le build.
//
// Android (depuis la version 9) et iOS refusent par défaut tout trafic HTTP non
// chiffré : une application construite pour une adresse en http:// échouerait à
// chaque requête, avec un simple « Network request failed ». On n'ouvre cette
// exception QUE pour ces builds-là — un build https reste strict.
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const enClair = apiUrl.startsWith('http://');

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: enClair } }],
    ],
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(enClair ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
      },
    },
  };
};

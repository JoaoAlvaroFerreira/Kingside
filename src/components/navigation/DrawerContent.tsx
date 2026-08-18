import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

// Read from the build rather than a literal, so the drawer cannot drift from
// the APK a tester is actually running. scripts/bump-version.js keeps
// app.json, package.json and build.gradle in step.
const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

export default function DrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kingside</Text>
        <Text style={styles.subtitle}>Chess Training</Text>
      </View>
      <DrawerItemList {...props} />
      <View style={styles.footer}>
        <Text style={styles.version}>v{APP_VERSION}</Text>
        <Text style={styles.credit}>Pieces: cburnett by Colin M.L. Burnett, CC BY-SA 3.0</Text>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: '#888', fontSize: 14 },
  footer: { padding: 20, marginTop: 'auto' },
  version: { color: '#666', fontSize: 12 },
  credit: { color: '#4a4a4a', fontSize: 10, marginTop: 6 },
});

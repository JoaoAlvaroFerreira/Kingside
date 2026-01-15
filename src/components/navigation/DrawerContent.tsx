import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { View, Text, StyleSheet } from 'react-native';

export default function DrawerContent(props: any) {
  return (
    <DrawerContentScrollView {...props} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Kingside</Text>
        <Text style={styles.subtitle}>Chess Training</Text>
      </View>
      <DrawerItemList {...props} />
      <View style={styles.footer}>
        <Text style={styles.version}>v1.0.0</Text>
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
});

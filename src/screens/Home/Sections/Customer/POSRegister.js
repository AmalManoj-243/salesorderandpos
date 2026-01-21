import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, FlatList, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { fetchPOSRegisters, fetchPOSSessions, createPOSSesionOdoo, closePOSSesionOdoo } from '@api/services/generalApi';

const POSRegister = ({ navigation }) => {
  const [registers, setRegisters] = useState([]);
  const [openSessions, setOpenSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadRegistersAndSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const [regs, sessions] = await Promise.all([
          fetchPOSRegisters(),
          fetchPOSSessions({ state: 'opened' })
        ]);
        // Only show the Icecube Factory register(s)
        const isIcecube = (name) => {
          if (!name) return false;
          return /ice\s*cube|icecube/i.test(String(name));
        };

        const allRegs = Array.isArray(regs) ? regs : [];
        const filteredRegs = allRegs.filter(r => isIcecube(r.name || r.display_name || r.config_name || ''));
        setRegisters(filteredRegs);

        const allSessions = Array.isArray(sessions) ? sessions : [];
        const filteredSessions = allSessions.filter(s => {
          const cfgName = s.config_id?.[1] || s.config_id?.[0] || s.name || '';
          return isIcecube(cfgName);
        });
        setOpenSessions(filteredSessions);
      } catch (err) {
        setError('Failed to load POS registers or sessions');
      } finally {
        setLoading(false);
      }
    };
    loadRegistersAndSessions();
  }, []);

  const handleOpenRegisterSession = async (register) => {
    setLoading(true);
    try {
      // You may want to pass userId if needed
      const resp = await createPOSSesionOdoo({ configId: register.id });
      if (resp && resp.error) {
        Alert.alert('Error', resp.error.message || 'Failed to open register');
      } else {
        Alert.alert('Register Opened', `Session ID: ${resp.result}`);
        // Reload sessions to reflect new open session
        const sessions = await fetchPOSSessions({ state: 'opened' });
        setOpenSessions(sessions);
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to open register');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRegisterSession = async (sessionId) => {
    Alert.alert(
      'Close Register',
      'Are you sure you want to close this register?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const resp = await closePOSSesionOdoo({ sessionId });
              if (resp && resp.error) {
                Alert.alert('Error', resp.error.message || 'Failed to close register');
              } else {
                Alert.alert('Register Closed', 'Session closed successfully');
                // Reload sessions to reflect closed session
                const sessions = await fetchPOSSessions({ state: 'opened' });
                setOpenSessions(sessions);
              }
            } catch (err) {
              Alert.alert('Error', err?.message || 'Failed to close register');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleContinueSelling = (session) => {
    navigation.navigate('TakeoutDelivery', {
      sessionId: session.id,
      registerId: session.config_id?.[0],
      registerName: session.name,
      userId: session.user_id?.[0],
      userName: session.user_id?.[1],
      openingAmount: session.cash_register_balance_start || 0,
      presetName: 'Takeaway'
    });
  };

  const renderOpenSession = ({ item }) => {
    console.log('Open session item:', item);
    return (
      <View style={[styles.card, styles.sessionItemCard]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionTitle}>{item.config_id?.[1] || item.config_id?.[0] || 'Register'}</Text>
            <Text style={styles.sessionMeta}>Session #{item.id} • {item.state}</Text>
            <Text style={styles.cardSubtitle}>Tap Continue to resume selling for this session</Text>
          </View>
          <Text style={styles.badge}>POS</Text>
        </View>

        <View style={styles.userRow}>
          <Text style={styles.userIcon}>👤</Text>
          <Text style={[styles.sessionUser, styles.userText]}>User: {item.user_id?.[1] || '—'}</Text>
        </View>
        <View style={styles.dateRow}>
          <Text style={styles.clockIcon}>🕒</Text>
          <Text style={[styles.sessionDate, styles.dateText]}>Opened At: {item.start_at ? new Date(item.start_at).toLocaleString() : '—'}</Text>
        </View>
        <View style={styles.cashRow}>
          <Text style={styles.cashIcon}>💵</Text>
          <Text style={[styles.sessionAmount, styles.cashText]}>Opening Amount: {typeof item.cash_register_balance_start === 'number' ? item.cash_register_balance_start.toFixed(2) : '—'}</Text>
        </View>

        <View style={styles.divider} />
        <View style={styles.cardActions}>
          <View style={styles.actionCol}>
            <Button title="Continue" onPress={() => handleContinueSelling(item)} style={styles.primaryBtn} textStyle={styles.primaryBtnText} />
          </View>
          <View style={styles.actionCol}>
            <Button title="Close" onPress={() => handleCloseRegisterSession(item.id)} style={styles.dangerBtn} textStyle={styles.dangerBtnText} />
          </View>
        </View>
      </View>
    );
  };

  const renderRegister = ({ item }) => (
    <View style={[styles.card, styles.registerCard]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionTitle}>{item.name}</Text>
          <Text style={styles.sessionMeta}>ID {item.id}</Text>
          <Text style={styles.cardSubtitle}>Open this register to start a new session</Text>
        </View>
        <Text style={styles.badge}>POS</Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <Button
          title="Open Register"
          onPress={() => handleOpenRegisterSession(item)}
          style={[styles.primaryBtn, { width: '100%' }]}
          textStyle={styles.primaryBtnText}
        />
      </View>
    </View>
  );

  // Filter out registers that already have open sessions (type-safe)
  const openConfigIds = openSessions.map(s => Number(s.config_id?.[0]));
  const availableRegisters = registers.filter(r => !openConfigIds.includes(Number(r.id)));

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="Icecube Factory" onBackPress={() => navigation.goBack()} />
      <View style={styles.centered}>
        <Text style={styles.sectionTitle}>Open Registers</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#2b6cb0" style={{ marginVertical: 16 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={openSessions}
            keyExtractor={item => item.id.toString()}
            renderItem={renderOpenSession}
            style={{ width: '100%' }}
            ListEmptyComponent={<Text style={styles.emptyText}>No open registers.</Text>}
          />
        )}

        <Text style={styles.sectionTitle}>Available Registers</Text>
        <FlatList
          data={availableRegisters}
          keyExtractor={item => item.id.toString()}
          renderItem={renderRegister}
          style={{ width: '100%' }}
          ListEmptyComponent={<Text style={styles.emptyText}>No available registers.</Text>}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 12, paddingTop: 40 },
  openBtn: { marginTop: 18, width: '95%', paddingVertical: 16, borderRadius: 12, minHeight: 52, justifyContent: 'center' },
  sessionItem: { backgroundColor: '#f6f8fa', padding: 14, borderRadius: 10, marginBottom: 10, width: '100%' },
  sessionTitle: { fontWeight: '800', fontSize: 20, color: '#2b6cb0' },
  sessionState: { fontSize: 14, color: '#444', marginTop: 2 },
  sessionUser: { fontSize: 16, color: '#444', marginTop: 22, fontWeight: '700' },
  sessionId: { fontSize: 12, color: '#888', marginTop: 2 },
  // Smaller gap above date; keep date more separated from user
  sessionDate: { fontSize: 16, color: '#666', marginTop: 12 },
  sessionAmount: { fontSize: 18, color: '#2b6cb0', marginTop: 6, fontWeight: '800' },
  // Card styles for modern look
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, borderLeftWidth: 6, borderLeftColor: '#2b6cb0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  cardIcon: { width: 28, height: 28, marginRight: 16, borderRadius: 8, resizeMode: 'contain', alignSelf: 'center' },
  sessionItemCard: { minHeight: 220, paddingVertical: 18 },
  registerCard: { minHeight: 220, paddingVertical: 18 },
  sessionMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  cardSubtitle: { fontSize: 13, color: '#6b7a90', marginTop: 6 },
  badge: { backgroundColor: '#e6f2ff', color: '#184e86', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, fontWeight: '900', fontSize: 14, overflow: 'hidden', position: 'absolute', right: 12, top: 12 },
  divider: { height: 1, backgroundColor: '#eef3fb', marginTop: 12, marginBottom: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', marginTop: 32 },
  userIcon: { fontSize: 20, marginRight: 8 },
  userText: { marginTop: 0 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  clockIcon: { fontSize: 18, marginRight: 8, color: '#6b7a90' },
  dateText: { marginTop: 0 },
  cashRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  cashIcon: { fontSize: 20, marginRight: 8, color: '#2b6cb0' },
  cashText: { marginTop: 0 },
  cardActions: { flexDirection: 'row', marginTop: 16 },
  actionCol: { flex: 1, marginHorizontal: 8 },
  primaryBtn: { backgroundColor: '#2b6cb0', borderRadius: 10, paddingVertical: 16, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  dangerBtn: { backgroundColor: '#c0392b', borderRadius: 10, paddingVertical: 16, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  dangerBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sectionTitle: { fontWeight: '800', fontSize: 18, marginBottom: 8, color: '#23395d', marginTop: 8, alignSelf: 'flex-start' },
  emptyText: { color: '#888', fontSize: 14, paddingVertical: 12 },
  errorText: { color: '#c00', fontSize: 14, paddingVertical: 12 },
});

export default POSRegister;

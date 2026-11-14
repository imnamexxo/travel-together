import { useEffect, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import Pressable from '@/components/pressable';
import { TravelColors as C } from '@/constants/theme';

/** react-native Alert의 버튼과 같은 모양. */
export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void | Promise<void> };

type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[] };

let nextId = 0;
let current: Dialog | null = null;
const listeners = new Set<(dialog: Dialog | null) => void>();

function publish(dialog: Dialog | null) {
  current = dialog;
  listeners.forEach((listener) => listener(dialog));
}

/**
 * 이 앱 디자인의 확인창. Alert.alert(title, message, buttons)와 같은 방식으로 부른다.
 * 버튼이 없으면 "확인" 하나. 화면 밖을 누르거나 뒤로 가기를 하면 취소 버튼처럼 닫힌다.
 */
export function showAlert(title: string, message?: string, buttons?: DialogButton[]) {
  publish({ id: ++nextId, title, message, buttons: buttons?.length ? buttons : [{ text: '확인' }] });
}

/** 앱 맨 바깥에 하나 둔다. 떠 있는 확인창을 그린다. */
export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(current);
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    listeners.add(setDialog);
    return () => { listeners.delete(setDialog); };
  }, []);
  useEffect(() => {
    if (dialog) { anim.setValue(0); Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 4 }).start(); }
  }, [dialog, anim]);

  if (!dialog) return null;
  const close = (button?: DialogButton) => {
    publish(null);
    void button?.onPress?.();
  };
  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  // 버튼이 셋 이상이면 세로로 쌓고 취소는 맨 아래에 둔다.
  const stacked = dialog.buttons.length > 2;
  const ordered = stacked ? [...dialog.buttons.filter((b) => b !== cancel), ...(cancel ? [cancel] : [])] : dialog.buttons;

  return <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(cancel)}>
    <View style={s.backdrop}>
      <Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={() => close(cancel)} />
      <Animated.View accessibilityViewIsModal style={[s.card, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
        <Text accessibilityRole="header" style={s.title}>{dialog.title}</Text>
        {!!dialog.message && <Text style={s.message}>{dialog.message}</Text>}
        <View style={[s.buttons, stacked && s.stacked]}>
          {ordered.map((b) => <Pressable key={b.text} haptic={b.style !== 'cancel'} accessibilityRole="button" accessibilityLabel={b.text} onPress={() => close(b)}
            style={[s.button, !stacked && s.flex, b.style === 'cancel' ? s.cancel : b.style === 'destructive' ? s.destructive : s.primary]}>
            <Text style={[s.buttonText, b.style === 'cancel' ? s.cancelText : s.primaryText]}>{b.text}</Text>
          </Pressable>)}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 380, backgroundColor: C.background, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  message: { fontSize: 14, lineHeight: 21, color: C.textSecondary, marginTop: 10 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 22 }, stacked: { flexDirection: 'column' },
  button: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, flex: { flex: 1 },
  primary: { backgroundColor: C.primary }, destructive: { backgroundColor: C.error }, cancel: { backgroundColor: C.surface },
  buttonText: { fontSize: 15, fontWeight: '600' }, primaryText: { color: '#fff' }, cancelText: { color: C.text },
});

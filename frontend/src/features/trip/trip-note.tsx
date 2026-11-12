import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TravelColors as C } from '@/constants/theme';

// Local preview state, independent of the selected day. Server sharing comes later.
export default function TripNote() {
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);

  function open() {
    setDraft(note);
    setVisible(true);
  }

  function save() {
    setNote(draft.trim());
    setVisible(false);
  }

  return (
    <View style={s.section}>
      <Pressable accessibilityRole="button" accessibilityLabel={note ? '여행 메모 전체 보기 및 수정' : '여행 메모 추가'}
        onPress={open} style={({ pressed }) => [s.card, pressed && s.pressed]}>
        <View style={s.header}>
          <Text style={s.title}>여행 메모</Text>
          <Text style={s.action}>{note ? '수정' : '＋ 메모 추가'}</Text>
        </View>
        {!!note && <Text numberOfLines={3} style={s.preview}>{note}</Text>}
      </Pressable>

      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={s.screen}>
          <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.editor}>
              <View style={s.header}>
                <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={s.navAction}>
                  <Text style={s.cancel}>취소</Text>
                </Pressable>
                <Text style={s.editorTitle}>여행 메모</Text>
                <Pressable accessibilityRole="button" onPress={save} style={s.navAction}>
                  <Text style={s.action}>저장</Text>
                </Pressable>
              </View>
              <TextInput accessibilityLabel="여행 메모 내용" value={draft} onChangeText={setDraft}
                placeholder={'숙소 체크인 시간, 예약 정보, 준비물 등을 적어보세요.'}
                placeholderTextColor={C.textMuted} style={s.input} multiline autoFocus maxLength={2000} />
              <Text style={s.count}>{draft.length.toLocaleString('ko-KR')} / 2,000</Text>
              {!!note && <Pressable accessibilityRole="button" style={s.clear} onPress={() => setDraft('')}>
                <Text style={s.clearText}>내용 비우기</Text>
              </Pressable>}
              <Text style={s.hint}>현재는 이 기기의 미리보기에만 반영돼요. 앱 재시작 시 초기화됩니다.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 26, marginBottom: 24 },
  card: { backgroundColor: C.banner, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16 },
  pressed: { opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { fontSize: 14, fontWeight: '600', color: C.primary },
  action: { fontSize: 14, fontWeight: '500', color: C.accent },
  preview: { marginTop: 12, fontSize: 14, lineHeight: 23, color: C.textSecondary },
  screen: { flex: 1, backgroundColor: C.background },
  editor: { paddingHorizontal: 24, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  navAction: { minWidth: 44, minHeight: 48, justifyContent: 'center' },
  cancel: { fontSize: 15, color: C.textSecondary },
  editorTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  input: { marginTop: 20, minHeight: 220, borderRadius: 14, backgroundColor: C.surface, padding: 16,
    fontSize: 16, lineHeight: 26, color: C.text, textAlignVertical: 'top' },
  count: { textAlign: 'right', fontSize: 12, color: C.textMuted, marginTop: 12 },
  clear: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 12 },
  clearText: { fontSize: 13, color: C.error },
  hint: { fontSize: 12, color: C.textMuted, lineHeight: 20, marginTop: 20 },
});

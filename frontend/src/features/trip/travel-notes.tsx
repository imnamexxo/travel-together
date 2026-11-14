import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TravelColors as C } from '@/constants/theme';

type CheckItem = { id: string; text: string; done: boolean };
type Section = { id: string; title: string; kind: 'memo' | 'checklist'; body: string; items: CheckItem[] };

// Local preview state only; all sections belong to the trip, not the selected day.
export default function TravelNotes() {
  const [sections, setSections] = useState<Section[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [draft, setDraft] = useState<Section | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const nextId = () => `note-${Date.now()}-${sequence.current++}`;
  const existing = !!draft && sections.some((section) => section.id === draft.id);

  function open(section?: Section) {
    setDraft(section ? { ...section, items: section.items.map((item) => ({ ...item })) } : {
      id: nextId(), title: '', kind: 'memo', body: '', items: [{ id: nextId(), text: '', done: false }],
    });
    setError('');
  }

  function save() {
    if (!draft) return;
    if (!draft.title.trim()) { setError('제목을 입력해주세요.'); return; }
    const items = draft.items.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() }));
    if (draft.kind === 'memo' && !draft.body.trim()) { setError('메모 내용을 입력해주세요.'); return; }
    if (draft.kind === 'checklist' && !items.length) { setError('체크할 항목을 하나 이상 입력해주세요.'); return; }
    const saved = { ...draft, title: draft.title.trim(), body: draft.body.trim(), items };
    setSections((current) => existing ? current.map((section) => section.id === saved.id ? saved : section) : [...current, saved]);
    setExpanded((current) => current.includes(saved.id) ? current : [...current, saved.id]);
    setDraft(null);
  }

  function remove() {
    if (!draft) return;
    const id = draft.id;
    Alert.alert('섹션을 삭제할까요?', '메모와 체크 항목이 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => {
        setSections((current) => current.filter((section) => section.id !== id));
        setExpanded((current) => current.filter((entry) => entry !== id));
        setDraft(null);
      } },
    ]);
  }

  function toggle(sectionId: string, itemId: string) {
    setSections((current) => current.map((section) => section.id === sectionId ? {
      ...section, items: section.items.map((item) => item.id === itemId ? { ...item, done: !item.done } : item),
    } : section));
  }

  return <View style={s.section}>
    <View style={s.header}>
      <Text style={s.heading}>여행 메모</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="메모 또는 체크리스트 추가" onPress={() => open()} style={s.action}><Text style={s.link}>＋ 추가</Text></Pressable>
    </View>
    {sections.map((section) => {
      const isExpanded = expanded.includes(section.id);
      const completed = section.items.filter((item) => item.done).length;
      return <View key={section.id} style={s.card}>
        <View style={s.sectionHeader}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} accessibilityLabel={`${section.title}, ${isExpanded ? '접기' : '펼치기'}`}
          onPress={() => setExpanded((current) => isExpanded ? current.filter((id) => id !== section.id) : [...current, section.id])} style={s.cardHeader}>
          <View style={s.titleGroup}><Text style={s.cardTitle}>{section.title}</Text>{section.kind === 'checklist' && <Text style={s.sub}>{completed}/{section.items.length} 완료</Text>}</View>
          <Text style={s.chevron}>{isExpanded ? '⌃' : '⌄'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${section.title} 수정`} onPress={() => open(section)} style={s.editAction}><Text style={s.editText}>수정</Text></Pressable>
        </View>
        {isExpanded && <View style={s.cardBody}>
          {section.kind === 'memo' ? <Pressable accessibilityRole="button" accessibilityLabel={`${section.title} 전체 보기 및 수정`} onPress={() => open(section)}><Text numberOfLines={3} style={s.body}>{section.body}</Text></Pressable> : section.items.map((item) => (
            <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.text} onPress={() => toggle(section.id, item.id)} style={s.checkRow}>
              <View style={[s.checkbox, item.done && s.checked]}><Text style={s.checkmark}>{item.done ? '✓' : ''}</Text></View>
              <Text style={[s.checkText, item.done && s.done]}>{item.text}</Text>
            </Pressable>
          ))}
        </View>}
      </View>;
    })}

    <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
      <SafeAreaView style={s.screen}><KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {draft && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.editor}>
          <View style={s.header}>
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={s.action}><Text style={s.cancel}>취소</Text></Pressable>
            <Text style={s.editorTitle}>{existing ? '여행 메모 수정' : '여행 메모 추가'}</Text>
            <Pressable accessibilityRole="button" onPress={save} style={s.action}><Text style={s.link}>저장</Text></Pressable>
          </View>
          <View style={s.types}>{(['memo', 'checklist'] as const).map((kind) => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: draft.kind === kind }}
            onPress={() => { setDraft({ ...draft, kind }); setError(''); }} style={[s.type, draft.kind === kind && s.typeSelected]}>
            <Text style={[s.typeText, draft.kind === kind && s.typeTextSelected]}>{kind === 'memo' ? '메모' : '체크리스트'}</Text>
          </Pressable>)}</View>
          <Text style={s.label}>제목</Text>
          <TextInput accessibilityLabel="섹션 제목" style={s.input} value={draft.title} maxLength={50} placeholder="예: 준비물, 숙소 정보, 예약 확인" placeholderTextColor={C.textMuted} onChangeText={(title) => setDraft({ ...draft, title })} />
          <Text style={s.label}>{draft.kind === 'memo' ? '내용' : '체크 항목'}</Text>
          {draft.kind === 'memo' ? <>
            <TextInput accessibilityLabel="메모 내용" value={draft.body} onChangeText={(body) => setDraft({ ...draft, body })} placeholder="여행에 필요한 내용을 적어보세요." placeholderTextColor={C.textMuted} style={[s.input, s.memoInput]} multiline maxLength={2000} />
            <Text style={s.count}>{draft.body.length} / 2,000</Text>
          </> : <>
            {draft.items.map((item, index) => <View key={item.id} style={s.editRow}>
              <TextInput accessibilityLabel={`${index + 1}번째 체크 항목`} value={item.text} placeholder={`항목 ${index + 1}`} placeholderTextColor={C.textMuted} maxLength={120} style={[s.input, s.itemInput]}
                onChangeText={(text) => setDraft({ ...draft, items: draft.items.map((entry) => entry.id === item.id ? { ...entry, text } : entry) })} />
              <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}번째 항목 삭제`} onPress={() => setDraft({ ...draft, items: draft.items.filter((entry) => entry.id !== item.id) })} style={s.removeAction}><Text style={s.removeText}>−</Text></Pressable>
            </View>)}
            <Pressable accessibilityRole="button" disabled={draft.items.length >= 30} onPress={() => setDraft({ ...draft, items: [...draft.items, { id: nextId(), text: '', done: false }] })} style={s.action}>
              <Text style={draft.items.length >= 30 ? s.sub : s.link}>{draft.items.length >= 30 ? '항목은 최대 30개까지 추가할 수 있어요' : '＋ 항목 추가'}</Text>
            </Pressable>
          </>}
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {existing && <Pressable accessibilityRole="button" style={s.action} onPress={remove}><Text style={s.error}>섹션 삭제</Text></Pressable>}
          <Text style={s.hint}>현재는 이 기기의 미리보기에만 반영돼요. 앱 재시작 시 초기화됩니다.</Text>
        </ScrollView>}
      </KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  section: { marginTop: 16, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: 15, fontWeight: '600', color: C.primary },
  link: { fontSize: 14, fontWeight: '500', color: C.accent },
  action: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  card: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider, paddingBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeader: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  titleGroup: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
  cardTitle: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: C.text },
  sub: { fontSize: 12, color: C.textMuted },
  chevron: { fontSize: 19, color: C.accent },
  cardBody: { paddingBottom: 2 },
  body: { fontSize: 14, lineHeight: 23, color: C.textSecondary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 2 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: C.inactive, alignItems: 'center', justifyContent: 'center' },
  checked: { borderColor: C.primary, backgroundColor: C.primary },
  checkmark: { color: C.onPrimary, fontSize: 11, lineHeight: 13, fontWeight: '600' },
  checkText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.text },
  done: { color: C.textMuted, textDecorationLine: 'line-through' },
  editAction: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  editText: { fontSize: 12, color: C.accent },
  screen: { flex: 1, backgroundColor: C.background },
  editor: { paddingHorizontal: 24, paddingBottom: 32, width: '100%', maxWidth: 600, alignSelf: 'center' },
  editorTitle: { fontSize: 17, fontWeight: '600', color: C.text },
  cancel: { fontSize: 15, color: C.textSecondary },
  types: { flexDirection: 'row', gap: 6, backgroundColor: C.surface, padding: 4, borderRadius: 12, marginTop: 20 },
  type: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 9 },
  typeSelected: { backgroundColor: C.primary },
  typeText: { fontSize: 14, color: C.textSecondary },
  typeTextSelected: { color: C.onPrimary, fontWeight: '600' },
  label: { fontSize: 13, color: C.textSecondary, marginTop: 24, marginBottom: 10 },
  input: { backgroundColor: C.surface, borderRadius: 12, padding: 15, minHeight: 50, fontSize: 16, color: C.text },
  memoInput: { minHeight: 180, textAlignVertical: 'top', lineHeight: 26 },
  count: { fontSize: 12, color: C.textMuted, marginTop: 10, textAlign: 'right' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  itemInput: { flex: 1 },
  removeAction: { minWidth: 44, minHeight: 50, justifyContent: 'center', alignItems: 'center' },
  removeText: { fontSize: 24, color: C.textMuted },
  error: { fontSize: 13, color: C.error, lineHeight: 20 },
  hint: { fontSize: 12, color: C.textMuted, lineHeight: 20, marginTop: 20 },
});

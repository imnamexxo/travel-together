import { useState } from 'react';
import { FlatList, Image, Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Pressable from '@/components/pressable';
import { SafeAreaView } from 'react-native-safe-area-context';

export type ViewerPhoto = { id: string; url: string; caption?: string };

/** 사진을 화면 가득 크게 보고 옆으로 넘긴다. start는 처음 보여 줄 사진의 순서. */
export default function PhotoViewer({ photos, start, title, onClose }: { photos: ViewerPhoto[]; start: number; title?: string; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  return <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={s.screen}>
      <View style={s.top}>
        <Text style={s.title} numberOfLines={1}>{title ?? ''}</Text>
        <Text style={s.count}>{index + 1} / {photos.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="사진 닫기" onPress={onClose} style={s.close}><Text style={s.closeText}>닫기</Text></Pressable>
      </View>
      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <View style={[s.page, { width }]}>
          <Image accessibilityLabel="크게 본 사진" source={{ uri: item.url }} style={s.image} resizeMode="contain" />
          {!!item.caption && <Text style={s.caption}>{item.caption}</Text>}
        </View>}
      />
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }, count: { color: '#bbb', fontSize: 13, fontVariant: ['tabular-nums'] },
  close: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }, closeText: { color: '#fff', fontSize: 15 },
  page: { flex: 1, justifyContent: 'center' }, image: { flex: 1 },
  caption: { color: '#ddd', fontSize: 12, textAlign: 'center', paddingVertical: 10 },
});

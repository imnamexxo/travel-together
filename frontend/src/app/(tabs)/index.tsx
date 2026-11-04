import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { useMe } from '@/api/queries';
import { useAuth } from '@/auth/auth-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function PlannerScreen() {
  const me = useMe();
  const { signOut } = useAuth();

  return (
    <ThemedView style={styles.container}>
      {me.isPending ? (
        <ActivityIndicator />
      ) : me.isError ? (
        <>
          <ThemedText>{me.error.message}</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => me.refetch()}>
            <ThemedText type="linkPrimary">다시 시도</ThemedText>
          </Pressable>
        </>
      ) : (
        <ThemedText type="subtitle">안녕하세요, {me.data.display_name}님</ThemedText>
      )}
      <ThemedText themeColor="textSecondary">날짜별 일정이 여기에 표시됩니다.</ThemedText>
      <Pressable accessibilityRole="button" onPress={() => signOut()} style={styles.signOut}>
        <ThemedText type="link">로그아웃</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  signOut: {
    marginTop: Spacing.four,
  },
});

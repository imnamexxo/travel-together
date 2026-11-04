import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthError } from '@/auth/auth-service';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signUp';
  const canSubmit =
    email.trim() !== '' && password !== '' && (!isSignUp || displayName.trim() !== '') && !submitting;

  async function submit() {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const result = await signUp(email.trim(), password, displayName.trim());
        if (result.needsEmailConfirmation) {
          setNotice('인증 메일을 보냈습니다. 메일함에서 인증한 뒤 로그인해 주세요.');
          setMode('signIn');
        }
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(e instanceof AuthError ? e.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.form}>
        <ThemedText type="subtitle">{isSignUp ? '가입하기' : '로그인'}</ThemedText>

        {isSignUp && (
          <TextInput
            style={inputStyle}
            placeholder="표시 이름"
            placeholderTextColor={theme.textSecondary}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={30}
          />
        )}
        <TextInput
          style={inputStyle}
          placeholder="이메일"
          placeholderTextColor={theme.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextInput
          style={inputStyle}
          placeholder="비밀번호"
          placeholderTextColor={theme.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {notice && <ThemedText>{notice}</ThemedText>}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={submit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}>
          <ThemedText style={styles.buttonText}>{isSignUp ? '가입하기' : '로그인'}</ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode(isSignUp ? 'signIn' : 'signUp');
            setError(null);
          }}>
          <ThemedText type="linkPrimary">
            {isSignUp ? '이미 계정이 있나요? 로그인' : '계정이 없나요? 가입하기'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D93025',
  },
  button: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    backgroundColor: '#208AEF',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 700,
  },
});

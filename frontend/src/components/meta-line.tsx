import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

/**
 * 짧은 정보 여러 개를 한 줄에 띄어서 보여 준다(예: "일정 2개   사진 1장   지출 30,000원").
 * 가운뎃점(·)으로 이어 붙이지 않고 조각마다 따로 둔다. 빈 조각(false·'')은 빼고, 줄이 넘치면 다음 줄로 간다.
 */
export default function MetaLine({ parts, textStyle, style }: { parts: (string | false | null | undefined)[]; textStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle> }) {
  const shown = parts.filter((p): p is string => !!p);
  return <View style={[s.row, style]}>{shown.map((p, i) => <Text key={`${i}-${p}`} style={textStyle}>{p}</Text>)}</View>;
}

const s = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 } });

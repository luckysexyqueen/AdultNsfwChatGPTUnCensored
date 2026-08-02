import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Searchbar, Button, ActivityIndicator, IconButton } from 'react-native-paper';
import { useTheme } from '../../context/ThemeContext';
import { theme } from '../../constants/theme';

interface HuggingFaceSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: () => void;
  onClearSearch: () => void;
  isLoading: boolean;
}

export const HuggingFaceSearchBar: React.FC<HuggingFaceSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  isLoading
}) => {
  const { theme: currentTheme } = useTheme();
  const themeColors = theme[currentTheme];

  return (
    <>
      <Searchbar
        placeholder="Search on HuggingFace..."
        onChangeText={onSearchChange}
        onSubmitEditing={onSearchSubmit}
        value={searchQuery}
        style={[styles.searchBar, { backgroundColor: themeColors.cardBackground }]}
        inputStyle={{ color: themeColors.text }}
        iconColor={themeColors.text}
        right={searchQuery.length > 0 ? () => (
          <IconButton
            icon="close"
            onPress={onClearSearch}
            iconColor={themeColors.text}
            size={20}
          />
        ) : undefined}
      />

      {(searchQuery.length > 0 || isLoading) && (
        <View style={styles.searchActions}>
          {searchQuery.length > 0 && (
            <Button
              mode="outlined"
              onPress={onClearSearch}
              style={styles.clearButton}
              icon="close"
            >
              Clear Search
            </Button>
          )}
          {isLoading && <ActivityIndicator size="small" color={themeColors.primary} style={styles.loader} />}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    marginBottom: 16,
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
  loader: {
    marginLeft: 8,
  },
});

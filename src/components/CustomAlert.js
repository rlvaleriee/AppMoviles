import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CustomAlert({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', onPress: () => {} }],
  onDismiss,
}) {
  const { darkMode } = useTheme();

  const dynamicStyles = {
    overlay: {
      ...styles.overlay,
      backgroundColor: darkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
    },
    container: {
      ...styles.container,
      backgroundColor: darkMode ? '#2C2C2E' : '#FFFFFF',
    },
    title: {
      ...styles.title,
      color: darkMode ? '#FFFFFF' : '#000000',
    },
    message: {
      ...styles.message,
      color: darkMode ? '#EBEBF5' : '#3C3C43',
    },
    buttonSeparator: {
      ...styles.buttonSeparator,
      backgroundColor: darkMode ? '#38383A' : '#E5E5EA',
    },
    verticalSeparator: {
      ...styles.verticalSeparator,
      backgroundColor: darkMode ? '#38383A' : '#E5E5EA',
    },
  };

  const getButtonStyle = (button, index) => {
    const isDestructive = button.style === 'destructive';
    const isCancel = button.style === 'cancel';

    return {
      color: isDestructive
        ? '#FF453A'
        : isCancel
        ? (darkMode ? '#0A84FF' : '#007AFF')
        : (darkMode ? '#0A84FF' : '#007AFF'),
      fontWeight: isCancel ? '600' : '400',
    };
  };

  const handleButtonPress = (button) => {
    if (onDismiss) onDismiss();
    if (button.onPress) button.onPress();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={dynamicStyles.overlay}>
        <View style={dynamicStyles.container}>
          {title && <Text style={dynamicStyles.title}>{title}</Text>}
          {message && <Text style={dynamicStyles.message}>{message}</Text>}

          <View style={dynamicStyles.buttonSeparator} />

          <View style={[styles.buttonsContainer, buttons.length > 2 && styles.buttonsVertical]}>
            {buttons.map((button, index) => (
              <React.Fragment key={index}>
                {index > 0 && buttons.length <= 2 && (
                  <View style={dynamicStyles.verticalSeparator} />
                )}
                {index > 0 && buttons.length > 2 && (
                  <View style={dynamicStyles.buttonSeparator} />
                )}
                <TouchableOpacity
                  style={[
                    styles.button,
                    buttons.length > 2 && styles.buttonVertical,
                  ]}
                  onPress={() => handleButtonPress(button)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.buttonText, getButtonStyle(button, index)]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  container: {
    width: '100%',
    maxWidth: 270,
    borderRadius: 14,
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    lineHeight: 18,
  },
  buttonSeparator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  buttonsContainer: {
    flexDirection: 'row',
  },
  buttonsVertical: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonVertical: {
    flex: 0,
    paddingVertical: 12,
  },
  verticalSeparator: {
    width: StyleSheet.hairlineWidth,
    height: '100%',
  },
  buttonText: {
    fontSize: 17,
  },
});

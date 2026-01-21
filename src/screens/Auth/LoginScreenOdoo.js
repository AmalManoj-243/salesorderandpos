// src/screens/Auth/LoginScreenOdoo.js
import React, { useState } from "react";
import {
  View,
  Keyboard,
  StyleSheet,
  Image,
  TouchableWithoutFeedback,
} from "react-native";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { LogBox } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@components/common/Button";
import { OverlayLoader } from "@components/Loader";
import axios from "axios";
// Removed expo-cookie import
import { post } from "@api/services/utils";
import { useNavigation } from "@react-navigation/native";
import Text from "@components/Text";
import { TextInput } from "@components/common/TextInput";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";
// Removed privacy policy checkbox

import ODOO_DEFAULTS, { DEFAULT_ODOO_BASE_URL, DEFAULT_ODOO_DB } from "@api/config/odooConfig";

LogBox.ignoreLogs(["new NativeEventEmitter"]);
LogBox.ignoreAllLogs();

// 🔍 Check if URL looks like an Odoo server (accepts ngrok, http(s) hosts, or typical Odoo paths)
const isOdooUrl = (url = "") => {
  const lower = url.toLowerCase();
  // Accept explicit protocols, ngrok hosts, or typical odoo paths
  return (
    lower.startsWith('http') ||
    lower.includes('ngrok') ||
    lower.includes('odoo') ||
    lower.includes('/web') ||
    lower.includes(':8069')
  );
};

const LoginScreenOdoo = () => {
  const navigation = useNavigation();
  const setUser = useAuthStore((state) => state.login);

  // Removed privacy policy checkbox state

  const { container, imageContainer } = styles;

  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

  const [inputs, setInputs] = useState({
    baseUrl: "", // ✅ NEW: Server URL (optional)
    db: "",
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleOnchange = (text, input) => {
    setInputs((prevState) => ({ ...prevState, [input]: text }));
  };

  const handleError = (error, input) => {
    setErrors((prevState) => ({ ...prevState, [input]: error }));
  };

  const validate = () => {
    Keyboard.dismiss();
    let isValid = true;

    if (!inputs.username) {
      handleError("Please input user name", "username");
      isValid = false;
    }
    if (!inputs.password) {
      handleError("Please input password", "password");
      isValid = false;
    }
    // Privacy policy agreement removed

    if (isValid) {
      login();
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const baseUrlRaw = inputs.baseUrl || "";
      const baseUrl = baseUrlRaw.trim();
      const username = inputs.username;
      const password = inputs.password;

      const useOdoo = baseUrl && isOdooUrl(baseUrl);

      if (useOdoo) {
        // ODOO CUSTOMER LOGIN
        const normalized = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        const finalOdooUrl = (normalized.replace(/\/+$/, "") || DEFAULT_ODOO_BASE_URL);
        console.log('Using Odoo URL:', finalOdooUrl);
        const dbNameUsed = inputs.db && inputs.db.trim() ? inputs.db.trim() : DEFAULT_ODOO_DB;
        console.log('Logging in to Odoo DB:', dbNameUsed);
        const response = await axios.post(
          `${finalOdooUrl}/web/session/authenticate`,
          {
            jsonrpc: "2.0",
            method: "call",
            params: {
              db: dbNameUsed,
              login: username,
              password: password,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            withCredentials: true,
          }
        );
        console.log("🚀 Odoo login response:", JSON.stringify(response.data, null, 2));
        if (response.data.result && response.data.result.uid) {
          const userData = response.data.result;
          // persist selected/used DB for future calls
          try { await AsyncStorage.setItem('odoo_db', dbNameUsed); } catch (e) {}
          await AsyncStorage.setItem("userData", JSON.stringify(userData));
          const setCookieHeader = response.headers["set-cookie"];
          if (setCookieHeader && setCookieHeader.includes('session_id=')) {
            const sessionId = setCookieHeader.split('session_id=')[1]?.split(';')[0];
            await AsyncStorage.setItem('odoo_session_id', sessionId);
          }
          // Log the DB name stored in AsyncStorage
          const dbNameStored = await AsyncStorage.getItem('odoo_db');
          console.log('Current Odoo DB in storage:', dbNameStored);
          setUser(userData);
          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid Odoo credentials");
        }
      } else {
        // UAE ADMIN LOGIN
        const response = await post("/viewuser/login", {
          user_name: username,
          password: password,
        });
        console.log("🚀 UAE admin login response:", JSON.stringify(response, null, 2));
        if (response && response.success === true && response.data?.length) {
          const userData = response.data[0];
          await AsyncStorage.setItem("userData", JSON.stringify(userData));
          setUser(userData);
          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid admin credentials");
        }
      }
    } catch (error) {
      console.log("Login Error:", error.response ? error.response.data : error.message);
      showToastMessage(`Error! ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <SafeAreaView backgroundColor={COLORS.white}>
        <OverlayLoader visible={loading} />

        {/* Logo */}
        <View style={imageContainer}>
          <View style={styles.logoWrapper}>
            <Image
              source={require("@assets/images/header/logo_header.png")}
              style={{ width: 300, height: 180, alignSelf: "center" }}
              resizeMode="contain"
            />
          </View>
        </View>

        <RoundedScrollContainer
          backgroundColor={COLORS.white}
          paddingHorizontal={15}
          borderTopLeftRadius={40}
          borderTopRightRadius={40}
        >
          <View style={{ paddingTop: 8 }}>
            <View style={{ marginVertical: 5, marginHorizontal: 10 }}>
              <View style={{ marginTop: 0, marginBottom: 15 }}>
                <Text
                  style={{
                    fontSize: 25,
                    fontFamily: FONT_FAMILY.urbanistBold,
                    color: "#2e2a4f",
                    textAlign: "center",
                  }}
                >
                  Login
                </Text>
              </View>

              {/* Server URL */}
              <TextInput
                onChangeText={(text) => handleOnchange(text, "baseUrl")}
                onFocus={() => handleError(null, "baseUrl")}
                label="Server URL"
                placeholder="Enter Server URL"
                column={true}
                login={true}
              />

              {/* Username */}
              <TextInput
                onChangeText={(text) => handleOnchange(text, "username")}
                onFocus={() => handleError(null, "username")}
                iconName="account-outline"
                label="Username or Email"
                placeholder="Enter Username or Email"
                error={errors.username}
                column={true}
                login={true}
              />

              {/* Password */}
              <TextInput
                onChangeText={(text) => handleOnchange(text, "password")}
                onFocus={() => handleError(null, "password")}
                error={errors.password}
                iconName="lock-outline"
                label="Password"
                placeholder="Enter password"
                password
                column={true}
                login={true}
              />

              {/* Privacy policy checkbox removed as requested */}

              {/* Login Button */}
              <View style={styles.bottom}>
                <Button title="Login" onPress={validate} />
              </View>
            </View>
          </View>
        </RoundedScrollContainer>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: 10,
  },
  tinyLogo: {
    width: 200,
    height: 200,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: "4%",
  },
  logoWrapper: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 8,
  },
  bottom: {
    alignItems: "center",
    marginTop: 10,
  },
  label: {
    marginVertical: 5,
    fontSize: 14,
    color: COLORS.grey,
    marginLeft: 180,
    marginTop: 15,
  },
});

export default LoginScreenOdoo;

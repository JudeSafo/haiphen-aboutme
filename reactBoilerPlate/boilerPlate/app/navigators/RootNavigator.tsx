// app/navigators/RootNavigator.tsx
import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  Image,
  Text,
  ImageSourcePropType,
} from "react-native";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from "@react-navigation/drawer";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "app/theme";
import { LandingScreen } from "app/screens/LandingScreen";

/* -------------------------------------------------------------------------- */
/*                           Route-param type helpers                         */
/* -------------------------------------------------------------------------- */

export type RootDrawerParamList = {
  Tabs: undefined;
  Settings: undefined;
};

export type ShellTabParamList = {
  Home: undefined;     // Landing screen
  Activity: undefined; // placeholder
  Network: undefined;  // placeholder
};

const Drawer = createDrawerNavigator<RootDrawerParamList>();
const Tabs   = createBottomTabNavigator<ShellTabParamList>();

/* -------------------------------------------------------------------------- */
/*                             Tab-bar icon assets                            */
/* -------------------------------------------------------------------------- */

const ICONS = {
  home:     require("../../assets/icons/menu.png"),      // choose your art
  activity: require("../../assets/icons/bell.png"),
  network:  require("../../assets/icons/settings.png"),
} satisfies Record<string, ImageSourcePropType>;

function TabBarIcon({
  source,
  focused,
}: {
  source: ImageSourcePropType;
  focused: boolean;
}) {
  return (
    <Image
      source={source}
      style={{
        width: 22,
        height: 22,
        resizeMode: "contain",
        tintColor: focused ? colors.tint ?? colors.text : colors.text,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Place-holder view                             */
/* -------------------------------------------------------------------------- */

function Placeholder({ title }: { title: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>
        {title}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Bottom tabs                                 */
/* -------------------------------------------------------------------------- */

function ShellTabs() {
  console.debug("[nav] ShellTabs mount");
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: true,
        tabBarStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="Home"
        component={LandingScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabBarIcon source={ICONS.home} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="Activity"
        children={() => <Placeholder title="Activity" />}
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => (
            <TabBarIcon source={ICONS.activity} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="Network"
        children={() => <Placeholder title="Network" />}
        options={{
          title: "Network",
          tabBarIcon: ({ focused }) => (
            <TabBarIcon source={ICONS.network} focused={focused} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Drawer content + wrapper                          */
/* -------------------------------------------------------------------------- */

function AppDrawerContent(props: any) {
  const insets = useSafeAreaInsets();
  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/robot_haiphen.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Haiphen</Text>
      </View>

      <DrawerItem
        label="Home"
        onPress={() => props.navigation.navigate("Tabs")}
        labelStyle={styles.itemLabel}
      />
      <DrawerItem
        label="Settings"
        onPress={() => props.navigation.navigate("Settings")}
        labelStyle={styles.itemLabel}
      />
    </DrawerContentScrollView>
  );
}

/* Root navigator – Drawer that wraps the bottom-tab shell */
export function RootNavigator() {
  console.debug("[nav] RootNavigator mount");
  return (
    <Drawer.Navigator
      initialRouteName="Tabs"
      drawerContent={(p) => <AppDrawerContent {...p} />}
      screenOptions={{
        headerShown: false,
        drawerType: Platform.OS === "ios" ? "slide" : "front",
        drawerStyle: { width: 280, backgroundColor: colors.background },
      }}
    >
      <Drawer.Screen name="Tabs" component={ShellTabs} />
      <Drawer.Screen
        name="Settings"
        children={() => <Placeholder title="Settings" />}
      />
    </Drawer.Navigator>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    styles                                  */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  header: { alignItems: "center", paddingVertical: 24 },
  logo: { width: 120, height: 120 },
  title: { marginTop: 8, fontSize: 18, fontWeight: "600", color: colors.text },
  itemLabel: { color: colors.text, fontSize: 16 },
});
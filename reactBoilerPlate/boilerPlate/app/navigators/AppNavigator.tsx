/**
 * Minimal App Navigator for MVP:
 * - Landing
 * - Permissions
 *
 * Preserves: theming (Dark/Default), navigationRef, back button handler
 */
import React from "react"
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native"
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack"
import { useColorScheme } from "react-native"

// Keep the utilities from your template
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"

// If you want to keep using theme colors for the Android nav bar, you can still import colors
import { colors } from "app/theme"

// Import our new MVP screens
import { LandingScreen } from "app/screens/LandingScreen"
import { PermissionsScreen } from "app/screens/PermissionsScreen"
import { RootNavigator } from "./RootNavigator"


// --- Routes & types ---
export type AppStackParamList = {
  Root: undefined      // Drawer + Tabs shell
  Permissions: undefined
}

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

const Stack = createNativeStackNavigator<AppStackParamList>()

// Screens on which Android back should exit the app.
// You can keep this local list for clarity (instead of Config.exitRoutes).
const exitRoutes: Array<keyof AppStackParamList> = ["Root"]


function AppStack() {
  return (
    <Stack.Navigator
      initialRouteName="Root"
      screenOptions={{ headerShown: false, navigationBarColor: colors.background }}
    >
      <Stack.Screen name="Root" component={RootNavigator} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
    </Stack.Navigator>
  )
}

export function AppNavigator() {
  const colorScheme = useColorScheme()

  // Back button exits when on a route included in exitRoutes
  useBackButtonHandler((routeName) => exitRoutes.includes(routeName as keyof AppStackParamList))

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={colorScheme === "dark" ? DarkTheme : DefaultTheme}
    >
      <AppStack />
    </NavigationContainer>
  )
}
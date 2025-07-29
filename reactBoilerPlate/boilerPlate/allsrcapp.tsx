File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/app.tsx

/* eslint-disable import/first */
/**
 * Welcome to the main entry point of the app. In this file, we'll
 * be kicking off our app.
 *
 * Most of this file is boilerplate and you shouldn't need to modify
 * it very often. But take some time to look through and understand
 * what is going on here.
 *
 * The app navigation resides in ./app/navigators, so head over there
 * if you're interested in adding screens and navigators.
 */
if (__DEV__) {
  // Load Reactotron in development only.
  // Note that you must be using metro's `inlineRequires` for this to work.
  // If you turn it off in metro.config.js, you'll have to manually import it.
  require("./devtools/ReactotronConfig.ts")
}
import "./utils/gestureHandler"
import "./i18n"
import "./utils/ignoreWarnings"
import { useFonts } from "expo-font"
import React from "react"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"
import * as Linking from "expo-linking"
import { useInitialRootStore } from "./models"
import { AppNavigator, useNavigationPersistence } from "./navigators"
import { ErrorBoundary } from "./screens/ErrorScreen/ErrorBoundary"
import * as storage from "./utils/storage"
import { customFontsToLoad } from "./theme"
import Config from "./config"

export const NAVIGATION_PERSISTENCE_KEY = "NAVIGATION_STATE"

// Web linking configuration
const prefix = Linking.createURL("/")
const config = {
  screens: {
    Login: {
      path: "",
    },
    Welcome: "welcome",
    Demo: {
      screens: {
        DemoShowroom: {
          path: "showroom/:queryIndex?/:itemIndex?",
        },
        DemoDebug: "debug",
        DemoPodcastList: "podcast",
        DemoCommunity: "community",
      },
    },
  },
}

interface AppProps {
  hideSplashScreen: () => Promise<boolean>
}

/**
 * This is the root component of our app.
 * @param {AppProps} props - The props for the `App` component.
 * @returns {JSX.Element} The rendered `App` component.
 */
function App(props: AppProps) {
  const { hideSplashScreen } = props
  const {
    initialNavigationState,
    onNavigationStateChange,
    isRestored: isNavigationStateRestored,
  } = useNavigationPersistence(storage, NAVIGATION_PERSISTENCE_KEY)

  const [areFontsLoaded, fontLoadError] = useFonts(customFontsToLoad)

  const { rehydrated } = useInitialRootStore(() => {
    // This runs after the root store has been initialized and rehydrated.

    // If your initialization scripts run very fast, it's good to show the splash screen for just a bit longer to prevent flicker.
    // Slightly delaying splash screen hiding for better UX; can be customized or removed as needed,
    // Note: (vanilla Android) The splash-screen will not appear if you launch your app via the terminal or Android Studio. Kill the app and launch it normally by tapping on the launcher icon. https://stackoverflow.com/a/69831106
    // Note: (vanilla iOS) You might notice the splash-screen logo change size. This happens in debug/development mode. Try building the app for release.
    setTimeout(hideSplashScreen, 500)
  })

  // Before we show the app, we have to wait for our state to be ready.
  // In the meantime, don't render anything. This will be the background
  // color set in native by rootView's background color.
  // In iOS: application:didFinishLaunchingWithOptions:
  // In Android: https://stackoverflow.com/a/45838109/204044
  // You can replace with your own loading component if you wish.
  if (!rehydrated || !isNavigationStateRestored || (!areFontsLoaded && !fontLoadError)) {
    return null
  }

  const linking = {
    prefixes: [prefix],
    config,
  }

  // otherwise, we're ready to render the app
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ErrorBoundary catchErrors={Config.catchErrors}>
        <AppNavigator
          linking={linking}
          initialState={initialNavigationState}
          onStateChange={onNavigationStateChange}
        />
      </ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default App

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/config/config.base.ts

export interface ConfigBaseProps {
  persistNavigation: "always" | "dev" | "prod" | "never"
  catchErrors: "always" | "dev" | "prod" | "never"
  exitRoutes: string[]
}

export type PersistNavigationConfig = ConfigBaseProps["persistNavigation"]

const BaseConfig: ConfigBaseProps = {
  // This feature is particularly useful in development mode, but
  // can be used in production as well if you prefer.
  persistNavigation: "dev",

  /**
   * Only enable if we're catching errors in the right environment
   */
  catchErrors: "always",

  /**
   * This is a list of all the route names that will exit the app if the back button
   * is pressed while in that screen. Only affects Android.
   */
  exitRoutes: ["Welcome"],
}

export default BaseConfig

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/config/config.prod.ts

/**
 * These are configuration settings for the production environment.
 *
 * Do not include API secrets in this file or anywhere in your JS.
 *
 * https://reactnative.dev/docs/security#storing-sensitive-info
 */
export default {
  API_URL: "CHANGEME",
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/config/index.ts

/**
 * This file imports configuration objects from either the config.dev.js file
 * or the config.prod.js file depending on whether we are in __DEV__ or not.
 *
 * Note that we do not gitignore these files. Unlike on web servers, just because
 * these are not checked into your repo doesn't mean that they are secure.
 * In fact, you're shipping a JavaScript bundle with every
 * config variable in plain text. Anyone who downloads your app can easily
 * extract them.
 *
 * If you doubt this, just bundle your app, and then go look at the bundle and
 * search it for one of your config variable values. You'll find it there.
 *
 * Read more here: https://reactnative.dev/docs/security#storing-sensitive-info
 */
import BaseConfig from "./config.base"
import ProdConfig from "./config.prod"
import DevConfig from "./config.dev"

let ExtraConfig = ProdConfig

if (__DEV__) {
  ExtraConfig = DevConfig
}

const Config = { ...BaseConfig, ...ExtraConfig }

export default Config

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/config/config.dev.ts

/**
 * These are configuration settings for the dev environment.
 *
 * Do not include API secrets in this file or anywhere in your JS.
 *
 * https://reactnative.dev/docs/security#storing-sensitive-info
 */
export default {
  API_URL: "https://api.rss2json.com/v1/",
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/navigators/AppNavigator.tsx

/**
 * The app navigator (formerly "AppNavigator" and "MainNavigator") is used for the primary
 * navigation flows of your app.
 * Generally speaking, it will contain an auth flow (registration, login, forgot password)
 * and a "main" flow which the user will use once logged in.
 */
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  NavigatorScreenParams, // @demo remove-current-line
} from "@react-navigation/native"
import { createNativeStackNavigator, NativeStackScreenProps } from "@react-navigation/native-stack"
import { observer } from "mobx-react-lite"
import React from "react"
import { useColorScheme } from "react-native"
import * as Screens from "app/screens"
import Config from "../config"
import { useStores } from "../models" // @demo remove-current-line
import { DemoNavigator, DemoTabParamList } from "./DemoNavigator" // @demo remove-current-line
import { navigationRef, useBackButtonHandler } from "./navigationUtilities"
import { colors } from "app/theme"

/**
 * This type allows TypeScript to know what routes are defined in this navigator
 * as well as what properties (if any) they might take when navigating to them.
 *
 * If no params are allowed, pass through `undefined`. Generally speaking, we
 * recommend using your MobX-State-Tree store(s) to keep application state
 * rather than passing state through navigation params.
 *
 * For more information, see this documentation:
 *   https://reactnavigation.org/docs/params/
 *   https://reactnavigation.org/docs/typescript#type-checking-the-navigator
 *   https://reactnavigation.org/docs/typescript/#organizing-types
 */
export type AppStackParamList = {
  Welcome: undefined
  Login: undefined // @demo remove-current-line
  Demo: NavigatorScreenParams<DemoTabParamList> // @demo remove-current-line
  // 🔥 Your screens go here
  // IGNITE_GENERATOR_ANCHOR_APP_STACK_PARAM_LIST
}

/**
 * This is a list of all the route names that will exit the app if the back button
 * is pressed while in that screen. Only affects Android.
 */
const exitRoutes = Config.exitRoutes

export type AppStackScreenProps<T extends keyof AppStackParamList> = NativeStackScreenProps<
  AppStackParamList,
  T
>

// Documentation: https://reactnavigation.org/docs/stack-navigator/
const Stack = createNativeStackNavigator<AppStackParamList>()

const AppStack = observer(function AppStack() {
  // @demo remove-block-start
  const {
    authenticationStore: { isAuthenticated },
  } = useStores()

  // @demo remove-block-end
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, navigationBarColor: colors.background }}
      initialRouteName={isAuthenticated ? "Welcome" : "Login"} // @demo remove-current-line
    >
      {/* @demo remove-block-start */}
      {isAuthenticated ? (
        <>
          {/* @demo remove-block-end */}
          <Stack.Screen name="Welcome" component={Screens.WelcomeScreen} />
          {/* @demo remove-block-start */}
          <Stack.Screen name="Demo" component={DemoNavigator} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={Screens.LoginScreen} />
        </>
      )}
      {/* @demo remove-block-end */}
      {/** 🔥 Your screens go here */}
      {/* IGNITE_GENERATOR_ANCHOR_APP_STACK_SCREENS */}
    </Stack.Navigator>
  )
})

export interface NavigationProps
  extends Partial<React.ComponentProps<typeof NavigationContainer>> {}

export const AppNavigator = observer(function AppNavigator(props: NavigationProps) {
  const colorScheme = useColorScheme()

  useBackButtonHandler((routeName) => exitRoutes.includes(routeName))

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={colorScheme === "dark" ? DarkTheme : DefaultTheme}
      {...props}
    >
      <AppStack />
    </NavigationContainer>
  )
})

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/navigators/DemoNavigator.tsx

import { BottomTabScreenProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { CompositeScreenProps } from "@react-navigation/native"
import React from "react"
import { TextStyle, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Icon } from "../components"
import { translate } from "../i18n"
import { DemoCommunityScreen, DemoShowroomScreen, DemoDebugScreen } from "../screens"
import { DemoPodcastListScreen } from "../screens/DemoPodcastListScreen"
import { colors, spacing, typography } from "../theme"
import { AppStackParamList, AppStackScreenProps } from "./AppNavigator"

export type DemoTabParamList = {
  DemoCommunity: undefined
  DemoShowroom: { queryIndex?: string; itemIndex?: string }
  DemoDebug: undefined
  DemoPodcastList: undefined
}

/**
 * Helper for automatically generating navigation prop types for each route.
 *
 * More info: https://reactnavigation.org/docs/typescript/#organizing-types
 */
export type DemoTabScreenProps<T extends keyof DemoTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DemoTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

const Tab = createBottomTabNavigator<DemoTabParamList>()

/**
 * This is the main navigator for the demo screens with a bottom tab bar.
 * Each tab is a stack navigator with its own set of screens.
 *
 * More info: https://reactnavigation.org/docs/bottom-tab-navigator/
 * @returns {JSX.Element} The rendered `DemoNavigator`.
 */
export function DemoNavigator() {
  const { bottom } = useSafeAreaInsets()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: [$tabBar, { height: bottom + 70 }],
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text,
        tabBarLabelStyle: $tabBarLabel,
        tabBarItemStyle: $tabBarItem,
      }}
    >
      <Tab.Screen
        name="DemoShowroom"
        component={DemoShowroomScreen}
        options={{
          tabBarLabel: translate("demoNavigator.componentsTab"),
          tabBarIcon: ({ focused }) => (
            <Icon icon="components" color={focused ? colors.tint : undefined} size={30} />
          ),
        }}
      />

      <Tab.Screen
        name="DemoCommunity"
        component={DemoCommunityScreen}
        options={{
          tabBarLabel: translate("demoNavigator.communityTab"),
          tabBarIcon: ({ focused }) => (
            <Icon icon="community" color={focused ? colors.tint : undefined} size={30} />
          ),
        }}
      />

      <Tab.Screen
        name="DemoPodcastList"
        component={DemoPodcastListScreen}
        options={{
          tabBarAccessibilityLabel: translate("demoNavigator.podcastListTab"),
          tabBarLabel: translate("demoNavigator.podcastListTab"),
          tabBarIcon: ({ focused }) => (
            <Icon icon="podcast" color={focused ? colors.tint : undefined} size={30} />
          ),
        }}
      />

      <Tab.Screen
        name="DemoDebug"
        component={DemoDebugScreen}
        options={{
          tabBarLabel: translate("demoNavigator.debugTab"),
          tabBarIcon: ({ focused }) => (
            <Icon icon="debug" color={focused ? colors.tint : undefined} size={30} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

const $tabBar: ViewStyle = {
  backgroundColor: colors.background,
  borderTopColor: colors.transparent,
}

const $tabBarItem: ViewStyle = {
  paddingTop: spacing.md,
}

const $tabBarLabel: TextStyle = {
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/navigators/navigationUtilities.ts

import { useState, useEffect, useRef } from "react"
import { BackHandler, Linking, Platform } from "react-native"
import {
  NavigationState,
  PartialState,
  createNavigationContainerRef,
} from "@react-navigation/native"
import Config from "../config"
import type { PersistNavigationConfig } from "../config/config.base"
import { useIsMounted } from "../utils/useIsMounted"
import type { AppStackParamList, NavigationProps } from "./AppNavigator"

import * as storage from "../utils/storage"

type Storage = typeof storage

/**
 * Reference to the root App Navigator.
 *
 * If needed, you can use this to access the navigation object outside of a
 * `NavigationContainer` context. However, it's recommended to use the `useNavigation` hook whenever possible.
 * @see [Navigating Without Navigation Prop]{@link https://reactnavigation.org/docs/navigating-without-navigation-prop/}
 *
 * The types on this reference will only let you reference top level navigators. If you have
 * nested navigators, you'll need to use the `useNavigation` with the stack navigator's ParamList type.
 */
export const navigationRef = createNavigationContainerRef<AppStackParamList>()

/**
 * Gets the current screen from any navigation state.
 * @param {NavigationState | PartialState<NavigationState>} state - The navigation state to traverse.
 * @returns {string} - The name of the current screen.
 */
export function getActiveRouteName(state: NavigationState | PartialState<NavigationState>): string {
  const route = state.routes[state.index ?? 0]

  // Found the active route -- return the name
  if (!route.state) return route.name as keyof AppStackParamList

  // Recursive call to deal with nested routers
  return getActiveRouteName(route.state as NavigationState<AppStackParamList>)
}

/**
 * Hook that handles Android back button presses and forwards those on to
 * the navigation or allows exiting the app.
 * @see [BackHandler]{@link https://reactnative.dev/docs/backhandler}
 * @param {(routeName: string) => boolean} canExit - Function that returns whether we can exit the app.
 * @returns {void}
 */
export function useBackButtonHandler(canExit: (routeName: string) => boolean) {
  // ignore unless android... no back button!
  if (Platform.OS !== "android") return

  // The reason we're using a ref here is because we need to be able
  // to update the canExit function without re-setting up all the listeners
  const canExitRef = useRef(canExit)

  useEffect(() => {
    canExitRef.current = canExit
  }, [canExit])

  useEffect(() => {
    // We'll fire this when the back button is pressed on Android.
    const onBackPress = () => {
      if (!navigationRef.isReady()) {
        return false
      }

      // grab the current route
      const routeName = getActiveRouteName(navigationRef.getRootState())

      // are we allowed to exit?
      if (canExitRef.current(routeName)) {
        // exit and let the system know we've handled the event
        BackHandler.exitApp()
        return true
      }

      // we can't exit, so let's turn this into a back action
      if (navigationRef.canGoBack()) {
        navigationRef.goBack()
        return true
      }

      return false
    }

    // Subscribe when we come to life
    BackHandler.addEventListener("hardwareBackPress", onBackPress)

    // Unsubscribe when we're done
    return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress)
  }, [])
}

/**
 * This helper function will determine whether we should enable navigation persistence
 * based on a config setting and the __DEV__ environment (dev or prod).
 * @param {PersistNavigationConfig} persistNavigation - The config setting for navigation persistence.
 * @returns {boolean} - Whether to restore navigation state by default.
 */
function navigationRestoredDefaultState(persistNavigation: PersistNavigationConfig) {
  if (persistNavigation === "always") return false
  if (persistNavigation === "dev" && __DEV__) return false
  if (persistNavigation === "prod" && !__DEV__) return false

  // all other cases, disable restoration by returning true
  return true
}

/**
 * Custom hook for persisting navigation state.
 * @param {Storage} storage - The storage utility to use.
 * @param {string} persistenceKey - The key to use for storing the navigation state.
 * @returns {object} - The navigation state and persistence functions.
 */
export function useNavigationPersistence(storage: Storage, persistenceKey: string) {
  const [initialNavigationState, setInitialNavigationState] =
    useState<NavigationProps["initialState"]>()
  const isMounted = useIsMounted()

  const initNavState = navigationRestoredDefaultState(Config.persistNavigation)
  const [isRestored, setIsRestored] = useState(initNavState)

  const routeNameRef = useRef<keyof AppStackParamList | undefined>()

  const onNavigationStateChange = (state: NavigationState | undefined) => {
    const previousRouteName = routeNameRef.current
    if (state !== undefined) {
      const currentRouteName = getActiveRouteName(state)

      if (previousRouteName !== currentRouteName) {
        // track screens.
        if (__DEV__) {
          console.log(currentRouteName)
        }
      }

      // Save the current route name for later comparison
      routeNameRef.current = currentRouteName as keyof AppStackParamList

      // Persist state to storage
      storage.save(persistenceKey, state)
    }
  }

  const restoreState = async () => {
    try {
      const initialUrl = await Linking.getInitialURL()

      // Only restore the state if app has not started from a deep link
      if (!initialUrl) {
        const state = (await storage.load(persistenceKey)) as NavigationProps["initialState"] | null
        if (state) setInitialNavigationState(state)
      }
    } finally {
      if (isMounted()) setIsRestored(true)
    }
  }

  useEffect(() => {
    if (!isRestored) restoreState()
  }, [isRestored])

  return { onNavigationStateChange, restoreState, isRestored, initialNavigationState }
}

/**
 * use this to navigate without the navigation
 * prop. If you have access to the navigation prop, do not use this.
 * @see {@link https://reactnavigation.org/docs/navigating-without-navigation-prop/}
 * @param {unknown} name - The name of the route to navigate to.
 * @param {unknown} params - The params to pass to the route.
 */
export function navigate(name: unknown, params?: unknown) {
  if (navigationRef.isReady()) {
    // @ts-expect-error
    navigationRef.navigate(name as never, params as never)
  }
}

/**
 * This function is used to go back in a navigation stack, if it's possible to go back.
 * If the navigation stack can't go back, nothing happens.
 * The navigationRef variable is a React ref that references a navigation object.
 * The navigationRef variable is set in the App component.
 */
export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack()
  }
}

/**
 * resetRoot will reset the root navigation state to the given params.
 * @param {Parameters<typeof navigationRef.resetRoot>[0]} state - The state to reset the root to.
 * @returns {void}
 */
export function resetRoot(
  state: Parameters<typeof navigationRef.resetRoot>[0] = { index: 0, routes: [] },
) {
  if (navigationRef.isReady()) {
    navigationRef.resetRoot(state)
  }
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/navigators/index.ts

export * from "./AppNavigator"
export * from "./navigationUtilities"
// export other navigators from here

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/gestureHandler.native.ts

// Only import react-native-gesture-handler on native platforms
// https://reactnavigation.org/docs/drawer-navigator/#installation
import "react-native-gesture-handler"

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/useSafeAreaInsetsStyle.ts

import { Edge, useSafeAreaInsets } from "react-native-safe-area-context"

export type ExtendedEdge = Edge | "start" | "end"

const propertySuffixMap = {
  top: "Top",
  bottom: "Bottom",
  left: "Start",
  right: "End",
  start: "Start",
  end: "End",
}

const edgeInsetMap: Record<string, Edge> = {
  start: "left",
  end: "right",
}

export type SafeAreaInsetsStyle<
  Property extends "padding" | "margin" = "padding",
  Edges extends Array<ExtendedEdge> = Array<ExtendedEdge>,
> = {
  [K in Edges[number] as `${Property}${Capitalize<K>}`]: number
}

/**
 * A hook that can be used to create a safe-area-aware style object that can be passed directly to a View.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/utils/useSafeAreaInsetsStyle.ts/}
 * @param {ExtendedEdge[]} safeAreaEdges - The edges to apply the safe area insets to.
 * @param {"padding" | "margin"} property - The property to apply the safe area insets to.
 * @returns {SafeAreaInsetsStyle<Property, Edges>} - The style object with the safe area insets applied.
 */
export function useSafeAreaInsetsStyle<
  Property extends "padding" | "margin" = "padding",
  Edges extends Array<ExtendedEdge> = [],
>(
  safeAreaEdges: Edges = [] as unknown as Edges,
  property: Property = "padding" as Property,
): SafeAreaInsetsStyle<Property, Edges> {
  const insets = useSafeAreaInsets()

  return safeAreaEdges.reduce((acc, e) => {
    const value = edgeInsetMap[e] ?? e
    return { ...acc, [`${property}${propertySuffixMap[e]}`]: insets[value] }
  }, {}) as SafeAreaInsetsStyle<Property, Edges>
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/delay.ts

/**
 * A "modern" sleep statement.
 *
 * @param ms The number of milliseconds to wait.
 */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/openLinkInBrowser.ts

import { Linking } from "react-native"

/**
 * Helper for opening a give URL in an external browser.
 */
export function openLinkInBrowser(url: string) {
  Linking.canOpenURL(url).then((canOpen) => canOpen && Linking.openURL(url))
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/useIsMounted.ts

import { useEffect, useCallback, useRef } from "react"

/**
 * A common react custom hook to check if the component is mounted.
 * @returns {() => boolean} - A function that returns true if the component is mounted.
 */
export function useIsMounted() {
  const isMounted = useRef(false)

  useEffect(() => {
    isMounted.current = true

    return () => {
      isMounted.current = false
    }
  }, [])

  return useCallback(() => isMounted.current, [])
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/formatDate.ts

// Note the syntax of these imports from the date-fns library.
// If you import with the syntax: import { format } from "date-fns" the ENTIRE library
// will be included in your production bundle (even if you only use one function).
// This is because react-native does not support tree-shaking.
import type { Locale } from "date-fns"
import format from "date-fns/format"
import parseISO from "date-fns/parseISO"
import ar from "date-fns/locale/ar-SA"
import ko from "date-fns/locale/ko"
import en from "date-fns/locale/en-US"
import { i18n } from "app/i18n"

type Options = Parameters<typeof format>[2]

const getLocale = (): Locale => {
  const locale = i18n.locale.split("-")[0]
  return locale === "ar" ? ar : locale === "ko" ? ko : en
}

export const formatDate = (date: string, dateFormat?: string, options?: Options) => {
  const locale = getLocale()
  const dateOptions = {
    ...options,
    locale,
  }
  return format(parseISO(date), dateFormat ?? "MMM dd, yyyy", dateOptions)
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/useHeader.tsx

import React, { useLayoutEffect } from "react"
import { useNavigation } from "@react-navigation/native"
import { Header, HeaderProps } from "../components"

/**
 * A hook that can be used to easily set the Header of a react-navigation screen from within the screen's component.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/utility/useHeader/}
 * @param {HeaderProps} headerProps - The props for the `Header` component.
 * @param {any[]} deps - The dependencies to watch for changes to update the header.
 */
export function useHeader(
  headerProps: HeaderProps,
  deps: Parameters<typeof useLayoutEffect>[1] = [],
) {
  const navigation = useNavigation()

  React.useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      header: () => <Header {...headerProps} />,
    })
  }, [...deps, navigation])
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/gestureHandler.ts

// Don't import react-native-gesture-handler on web
// https://reactnavigation.org/docs/drawer-navigator/#installation

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/ignoreWarnings.ts

/**
 * Ignore some yellowbox warnings. Some of these are for deprecated functions
 * that we haven't gotten around to replacing yet.
 */
import { LogBox } from "react-native"

// prettier-ignore
LogBox.ignoreLogs([
  "Require cycle:",
])

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/utils/crashReporting.ts

/**
 * If you're using Sentry
 *   Expo https://docs.expo.dev/guides/using-sentry/
 */
// import * as Sentry from "@sentry/react-native"

/**
 * If you're using Crashlytics: https://rnfirebase.io/crashlytics/usage
 */
// import crashlytics from "@react-native-firebase/crashlytics"

/**
 * If you're using Bugsnag:
 *   RN   https://docs.bugsnag.com/platforms/react-native/)
 *   Expo https://docs.bugsnag.com/platforms/react-native/expo/
 */
// import Bugsnag from "@bugsnag/react-native"
// import Bugsnag from "@bugsnag/expo"

/**
 *  This is where you put your crash reporting service initialization code to call in `./app/app.tsx`
 */
export const initCrashReporting = () => {
  // Sentry.init({
  //   dsn: "YOUR DSN HERE",
  //   debug: true, // If `true`, Sentry will try to print out useful debugging information if something goes wrong with sending the event. Set it to `false` in production
  // })
  // Bugsnag.start("YOUR API KEY")
}

/**
 * Error classifications used to sort errors on error reporting services.
 */
export enum ErrorType {
  /**
   * An error that would normally cause a red screen in dev
   * and force the user to sign out and restart.
   */
  FATAL = "Fatal",
  /**
   * An error caught by try/catch where defined using Reactotron.tron.error.
   */
  HANDLED = "Handled",
}

/**
 * Manually report a handled error.
 */
export const reportCrash = (error: Error, type: ErrorType = ErrorType.FATAL) => {
  if (__DEV__) {
    // Log to console and Reactotron in development
    const message = error.message || "Unknown"
    console.error(error)
    console.log(message, type)
  } else {
    // In production, utilize crash reporting service of choice below:
    // RN
    // Sentry.captureException(error)
    // crashlytics().recordError(error)
    // Bugsnag.notify(error)
  }
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/RootStore.ts

import { Instance, SnapshotOut, types } from "mobx-state-tree"
import { AuthenticationStoreModel } from "./AuthenticationStore" // @demo remove-current-line
import { EpisodeStoreModel } from "./EpisodeStore" // @demo remove-current-line

/**
 * A RootStore model.
 */
export const RootStoreModel = types.model("RootStore").props({
  authenticationStore: types.optional(AuthenticationStoreModel, {}), // @demo remove-current-line
  episodeStore: types.optional(EpisodeStoreModel, {}), // @demo remove-current-line
})

/**
 * The RootStore instance.
 */
export interface RootStore extends Instance<typeof RootStoreModel> {}
/**
 * The data of a RootStore.
 */
export interface RootStoreSnapshot extends SnapshotOut<typeof RootStoreModel> {}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/EpisodeStore.ts

import { Instance, SnapshotOut, types } from "mobx-state-tree"
import { api } from "../services/api"
import { Episode, EpisodeModel } from "./Episode"
import { withSetPropAction } from "./helpers/withSetPropAction"

export const EpisodeStoreModel = types
  .model("EpisodeStore")
  .props({
    episodes: types.array(EpisodeModel),
    favorites: types.array(types.reference(EpisodeModel)),
    favoritesOnly: false,
  })
  .actions(withSetPropAction)
  .actions((store) => ({
    async fetchEpisodes() {
      const response = await api.getEpisodes()
      if (response.kind === "ok") {
        store.setProp("episodes", response.episodes)
      } else {
        console.error(`Error fetching episodes: ${JSON.stringify(response)}`)
      }
    },
    addFavorite(episode: Episode) {
      store.favorites.push(episode)
    },
    removeFavorite(episode: Episode) {
      store.favorites.remove(episode)
    },
  }))
  .views((store) => ({
    get episodesForList() {
      return store.favoritesOnly ? store.favorites : store.episodes
    },

    hasFavorite(episode: Episode) {
      return store.favorites.includes(episode)
    },
  }))
  .actions((store) => ({
    toggleFavorite(episode: Episode) {
      if (store.hasFavorite(episode)) {
        store.removeFavorite(episode)
      } else {
        store.addFavorite(episode)
      }
    },
  }))

export interface EpisodeStore extends Instance<typeof EpisodeStoreModel> {}
export interface EpisodeStoreSnapshot extends SnapshotOut<typeof EpisodeStoreModel> {}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/AuthenticationStore.ts

import { Instance, SnapshotOut, types } from "mobx-state-tree"

export const AuthenticationStoreModel = types
  .model("AuthenticationStore")
  .props({
    authToken: types.maybe(types.string),
    authEmail: "",
  })
  .views((store) => ({
    get isAuthenticated() {
      return !!store.authToken
    },
    get validationError() {
      if (store.authEmail.length === 0) return "can't be blank"
      if (store.authEmail.length < 6) return "must be at least 6 characters"
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.authEmail))
        return "must be a valid email address"
      return ""
    },
  }))
  .actions((store) => ({
    setAuthToken(value?: string) {
      store.authToken = value
    },
    setAuthEmail(value: string) {
      store.authEmail = value.replace(/ /g, "")
    },
    logout() {
      store.authToken = undefined
      store.authEmail = ""
    },
  }))

export interface AuthenticationStore extends Instance<typeof AuthenticationStoreModel> {}
export interface AuthenticationStoreSnapshot extends SnapshotOut<typeof AuthenticationStoreModel> {}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/Episode.ts

import { Instance, SnapshotIn, SnapshotOut, types } from "mobx-state-tree"
import { withSetPropAction } from "./helpers/withSetPropAction"
import { formatDate } from "../utils/formatDate"
import { translate } from "../i18n"

interface Enclosure {
  link: string
  type: string
  length: number
  duration: number
  rating: { scheme: string; value: string }
}

/**
 * This represents an episode of React Native Radio.
 */
export const EpisodeModel = types
  .model("Episode")
  .props({
    guid: types.identifier,
    title: "",
    pubDate: "", // Ex: 2022-08-12 21:05:36
    link: "",
    author: "",
    thumbnail: "",
    description: "",
    content: "",
    enclosure: types.frozen<Enclosure>(),
    categories: types.array(types.string),
  })
  .actions(withSetPropAction)
  .views((episode) => ({
    get parsedTitleAndSubtitle() {
      const defaultValue = { title: episode.title?.trim(), subtitle: "" }

      if (!defaultValue.title) return defaultValue

      const titleMatches = defaultValue.title.match(/^(RNR.*\d)(?: - )(.*$)/)

      if (!titleMatches || titleMatches.length !== 3) return defaultValue

      return { title: titleMatches[1], subtitle: titleMatches[2] }
    },
    get datePublished() {
      try {
        const formatted = formatDate(episode.pubDate)
        return {
          textLabel: formatted,
          accessibilityLabel: translate("demoPodcastListScreen.accessibility.publishLabel", {
            date: formatted,
          }),
        }
      } catch (error) {
        return { textLabel: "", accessibilityLabel: "" }
      }
    },
    get duration() {
      const seconds = Number(episode.enclosure.duration)
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = Math.floor((seconds % 3600) % 60)

      const hDisplay = h > 0 ? `${h}:` : ""
      const mDisplay = m > 0 ? `${m}:` : ""
      const sDisplay = s > 0 ? s : ""
      return {
        textLabel: hDisplay + mDisplay + sDisplay,
        accessibilityLabel: translate("demoPodcastListScreen.accessibility.durationLabel", {
          hours: h,
          minutes: m,
          seconds: s,
        }),
      }
    },
  }))

export interface Episode extends Instance<typeof EpisodeModel> {}
export interface EpisodeSnapshotOut extends SnapshotOut<typeof EpisodeModel> {}
export interface EpisodeSnapshotIn extends SnapshotIn<typeof EpisodeModel> {}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/index.ts

export * from "./RootStore"
export * from "./helpers/getRootStore"
export * from "./helpers/useStores"
export * from "./helpers/setupRootStore"

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/models/Episode.test.ts

import { EpisodeModel } from "./Episode"

const data = {
  guid: "f91f2ea0-378a-4a90-9a83-d438a0cc32f6",
  title: "RNR 244 - Rewriting GasBuddy in React Native",
  pubDate: "2022-01-20 21:05:36",
  link: "https://www.reactnativeradio.com/",
  author:
    "rnradio@infinite.red (Max Metral, Mark Rickert, Jamon Holmgren, Robin Heinze, Mazen Chami)",
  thumbnail:
    "https://image.simplecastcdn.com/images/fd1212b1-7d08-4c5a-8506-00188a4c6528/acb9f5dc-7451-42af-8c97-2f0f29d122ae/3000x3000/rnr-episode-rnr244.jpg?aid=rss_feed",
  description: "",
  content: "",
  enclosure: {
    link: "https://www.simplecast.com/podcasts/rnr/rnr244",
    type: "audio/mpeg",
    length: 0,
    duration: 2578,
    rating: {
      scheme: "urn:simplecast:classification",
      value: "clean",
    },
  },
}
const episode = EpisodeModel.create(data)

test("publish date format", () => {
  expect(episode.datePublished.textLabel).toBe("Jan 20, 2022")
  expect(episode.datePublished.accessibilityLabel).toBe(
    'demoPodcastListScreen.accessibility.publishLabel {"date":"Jan 20, 2022"}',
  )
})

test("duration format", () => {
  expect(episode.duration.textLabel).toBe("42:58")
  expect(episode.duration.accessibilityLabel).toBe(
    'demoPodcastListScreen.accessibility.durationLabel {"hours":0,"minutes":42,"seconds":58}',
  )
})

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/WelcomeScreen.tsx

import { observer } from "mobx-react-lite"
import React, { FC } from "react"
import { Image, ImageStyle, TextStyle, View, ViewStyle } from "react-native"
import {
  Button, // @demo remove-current-line
  Text,
} from "app/components"
import { isRTL } from "../i18n"
import { useStores } from "../models" // @demo remove-current-line
import { AppStackScreenProps } from "../navigators"
import { colors, spacing } from "../theme"
import { useHeader } from "../utils/useHeader" // @demo remove-current-line
import { useSafeAreaInsetsStyle } from "../utils/useSafeAreaInsetsStyle"

const welcomeLogo = require("../../assets/images/logo.png")
const welcomeFace = require("../../assets/images/welcome-face.png")

interface WelcomeScreenProps extends AppStackScreenProps<"Welcome"> {}

export const WelcomeScreen: FC<WelcomeScreenProps> = observer(function WelcomeScreen(
  _props, // @demo remove-current-line
) {
  // @demo remove-block-start
  const { navigation } = _props
  const {
    authenticationStore: { logout },
  } = useStores()

  function goNext() {
    navigation.navigate("Demo", { screen: "DemoShowroom", params: {} })
  }

  useHeader(
    {
      rightTx: "common.logOut",
      onRightPress: logout,
    },
    [logout],
  )
  // @demo remove-block-end

  const $bottomContainerInsets = useSafeAreaInsetsStyle(["bottom"])

  return (
    <View style={$container}>
      <View style={$topContainer}>
        <Image style={$welcomeLogo} source={welcomeLogo} resizeMode="contain" />
        <Text
          testID="welcome-heading"
          style={$welcomeHeading}
          tx="welcomeScreen.readyForLaunch"
          preset="heading"
        />
        <Text tx="welcomeScreen.exciting" preset="subheading" />
        <Image style={$welcomeFace} source={welcomeFace} resizeMode="contain" />
      </View>

      <View style={[$bottomContainer, $bottomContainerInsets]}>
        <Text tx="welcomeScreen.postscript" size="md" />
        {/* @demo remove-block-start */}
        <Button
          testID="next-screen-button"
          preset="reversed"
          tx="welcomeScreen.letsGo"
          onPress={goNext}
        />
        {/* @demo remove-block-end */}
      </View>
    </View>
  )
})

const $container: ViewStyle = {
  flex: 1,
  backgroundColor: colors.background,
}

const $topContainer: ViewStyle = {
  flexShrink: 1,
  flexGrow: 1,
  flexBasis: "57%",
  justifyContent: "center",
  paddingHorizontal: spacing.lg,
}

const $bottomContainer: ViewStyle = {
  flexShrink: 1,
  flexGrow: 0,
  flexBasis: "43%",
  backgroundColor: colors.palette.neutral100,
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  paddingHorizontal: spacing.lg,
  justifyContent: "space-around",
}
const $welcomeLogo: ImageStyle = {
  height: 88,
  width: "100%",
  marginBottom: spacing.xxl,
}

const $welcomeFace: ImageStyle = {
  height: 169,
  width: 269,
  position: "absolute",
  bottom: -47,
  right: -80,
  transform: [{ scaleX: isRTL ? -1 : 1 }],
}

const $welcomeHeading: TextStyle = {
  marginBottom: spacing.md,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/DemoDebugScreen.tsx

import React, { FC } from "react"
import * as Application from "expo-application"
import { Linking, Platform, TextStyle, View, ViewStyle } from "react-native"
import { Button, ListItem, Screen, Text } from "../components"
import { DemoTabScreenProps } from "../navigators/DemoNavigator"
import { colors, spacing } from "../theme"
import { isRTL } from "../i18n"
import { useStores } from "../models"

/**
 * @param {string} url - The URL to open in the browser.
 * @returns {void} - No return value.
 */
function openLinkInBrowser(url: string) {
  Linking.canOpenURL(url).then((canOpen) => canOpen && Linking.openURL(url))
}

export const DemoDebugScreen: FC<DemoTabScreenProps<"DemoDebug">> = function DemoDebugScreen(
  _props,
) {
  const {
    authenticationStore: { logout },
  } = useStores()

  const usingHermes = typeof HermesInternal === "object" && HermesInternal !== null
  // @ts-expect-error
  const usingFabric = global.nativeFabricUIManager != null

  const demoReactotron = React.useMemo(
    () => async () => {
      if (__DEV__) {
        console.tron.display({
          name: "DISPLAY",
          value: {
            appId: Application.applicationId,
            appName: Application.applicationName,
            appVersion: Application.nativeApplicationVersion,
            appBuildVersion: Application.nativeBuildVersion,
            hermesEnabled: usingHermes,
          },
          important: true,
        })
      }
    },
    [],
  )

  return (
    <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$container}>
      <Text
        style={$reportBugsLink}
        tx="demoDebugScreen.reportBugs"
        onPress={() => openLinkInBrowser("https://github.com/infinitered/ignite/issues")}
      />
      <Text style={$title} preset="heading" tx="demoDebugScreen.title" />
      <View style={$itemsContainer}>
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">App Id</Text>
              <Text>{Application.applicationId}</Text>
            </View>
          }
        />
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">App Name</Text>
              <Text>{Application.applicationName}</Text>
            </View>
          }
        />
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">App Version</Text>
              <Text>{Application.nativeApplicationVersion}</Text>
            </View>
          }
        />
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">App Build Version</Text>
              <Text>{Application.nativeBuildVersion}</Text>
            </View>
          }
        />
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">Hermes Enabled</Text>
              <Text>{String(usingHermes)}</Text>
            </View>
          }
        />
        <ListItem
          LeftComponent={
            <View style={$item}>
              <Text preset="bold">Fabric Enabled</Text>
              <Text>{String(usingFabric)}</Text>
            </View>
          }
        />
      </View>
      <View style={$buttonContainer}>
        <Button style={$button} tx="demoDebugScreen.reactotron" onPress={demoReactotron} />
        <Text style={$hint} tx={`demoDebugScreen.${Platform.OS}ReactotronHint` as const} />
      </View>
      <View style={$buttonContainer}>
        <Button style={$button} tx="common.logOut" onPress={logout} />
      </View>
    </Screen>
  )
}

const $container: ViewStyle = {
  paddingTop: spacing.lg + spacing.xl,
  paddingBottom: spacing.xxl,
  paddingHorizontal: spacing.lg,
}

const $title: TextStyle = {
  marginBottom: spacing.xxl,
}

const $reportBugsLink: TextStyle = {
  color: colors.tint,
  marginBottom: spacing.lg,
  alignSelf: isRTL ? "flex-start" : "flex-end",
}

const $item: ViewStyle = {
  marginBottom: spacing.md,
}

const $itemsContainer: ViewStyle = {
  marginBottom: spacing.xl,
}

const $button: ViewStyle = {
  marginBottom: spacing.xs,
}

const $buttonContainer: ViewStyle = {
  marginBottom: spacing.md,
}

const $hint: TextStyle = {
  color: colors.palette.neutral600,
  fontSize: 12,
  lineHeight: 15,
  paddingBottom: spacing.lg,
}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/DemoPodcastListScreen.tsx

import { observer } from "mobx-react-lite"
import React, { ComponentType, FC, useEffect, useMemo } from "react"
import {
  AccessibilityProps,
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  ImageStyle,
  Platform,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { type ContentStyle } from "@shopify/flash-list"
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import {
  Button,
  ButtonAccessoryProps,
  Card,
  EmptyState,
  Icon,
  ListView,
  Screen,
  Text,
  Toggle,
} from "../components"
import { isRTL, translate } from "../i18n"
import { useStores } from "../models"
import { Episode } from "../models/Episode"
import { DemoTabScreenProps } from "../navigators/DemoNavigator"
import { colors, spacing } from "../theme"
import { delay } from "../utils/delay"
import { openLinkInBrowser } from "../utils/openLinkInBrowser"

const ICON_SIZE = 14

const rnrImage1 = require("../../assets/images/demo/rnr-image-1.png")
const rnrImage2 = require("../../assets/images/demo/rnr-image-2.png")
const rnrImage3 = require("../../assets/images/demo/rnr-image-3.png")
const rnrImages = [rnrImage1, rnrImage2, rnrImage3]

export const DemoPodcastListScreen: FC<DemoTabScreenProps<"DemoPodcastList">> = observer(
  function DemoPodcastListScreen(_props) {
    const { episodeStore } = useStores()

    const [refreshing, setRefreshing] = React.useState(false)
    const [isLoading, setIsLoading] = React.useState(false)

    // initially, kick off a background refresh without the refreshing UI
    useEffect(() => {
      ;(async function load() {
        setIsLoading(true)
        await episodeStore.fetchEpisodes()
        setIsLoading(false)
      })()
    }, [episodeStore])

    // simulate a longer refresh, if the refresh is too fast for UX
    async function manualRefresh() {
      setRefreshing(true)
      await Promise.all([episodeStore.fetchEpisodes(), delay(750)])
      setRefreshing(false)
    }

    return (
      <Screen
        preset="fixed"
        safeAreaEdges={["top"]}
        contentContainerStyle={$screenContentContainer}
      >
        <ListView<Episode>
          contentContainerStyle={$listContentContainer}
          data={episodeStore.episodesForList.slice()}
          extraData={episodeStore.favorites.length + episodeStore.episodes.length}
          refreshing={refreshing}
          estimatedItemSize={177}
          onRefresh={manualRefresh}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator />
            ) : (
              <EmptyState
                preset="generic"
                style={$emptyState}
                headingTx={
                  episodeStore.favoritesOnly
                    ? "demoPodcastListScreen.noFavoritesEmptyState.heading"
                    : undefined
                }
                contentTx={
                  episodeStore.favoritesOnly
                    ? "demoPodcastListScreen.noFavoritesEmptyState.content"
                    : undefined
                }
                button={episodeStore.favoritesOnly ? "" : undefined}
                buttonOnPress={manualRefresh}
                imageStyle={$emptyStateImage}
                ImageProps={{ resizeMode: "contain" }}
              />
            )
          }
          ListHeaderComponent={
            <View style={$heading}>
              <Text preset="heading" tx="demoPodcastListScreen.title" />
              {(episodeStore.favoritesOnly || episodeStore.episodesForList.length > 0) && (
                <View style={$toggle}>
                  <Toggle
                    value={episodeStore.favoritesOnly}
                    onValueChange={() =>
                      episodeStore.setProp("favoritesOnly", !episodeStore.favoritesOnly)
                    }
                    variant="switch"
                    labelTx="demoPodcastListScreen.onlyFavorites"
                    labelPosition="left"
                    labelStyle={$labelStyle}
                    accessibilityLabel={translate("demoPodcastListScreen.accessibility.switch")}
                  />
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <EpisodeCard
              episode={item}
              isFavorite={episodeStore.hasFavorite(item)}
              onPressFavorite={() => episodeStore.toggleFavorite(item)}
            />
          )}
        />
      </Screen>
    )
  },
)

const EpisodeCard = observer(function EpisodeCard({
  episode,
  isFavorite,
  onPressFavorite,
}: {
  episode: Episode
  onPressFavorite: () => void
  isFavorite: boolean
}) {
  const liked = useSharedValue(isFavorite ? 1 : 0)

  const imageUri = useMemo<ImageSourcePropType>(() => {
    return rnrImages[Math.floor(Math.random() * rnrImages.length)]
  }, [])

  // Grey heart
  const animatedLikeButtonStyles = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(liked.value, [0, 1], [1, 0], Extrapolate.EXTEND),
        },
      ],
      opacity: interpolate(liked.value, [0, 1], [1, 0], Extrapolate.CLAMP),
    }
  })

  // Pink heart
  const animatedUnlikeButtonStyles = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: liked.value,
        },
      ],
      opacity: liked.value,
    }
  })

  /**
   * Android has a "longpress" accessibility action. iOS does not, so we just have to use a hint.
   * @see https://reactnative.dev/docs/accessibility#accessibilityactions
   */
  const accessibilityHintProps = useMemo(
    () =>
      Platform.select<AccessibilityProps>({
        ios: {
          accessibilityLabel: episode.title,
          accessibilityHint: translate("demoPodcastListScreen.accessibility.cardHint", {
            action: isFavorite ? "unfavorite" : "favorite",
          }),
        },
        android: {
          accessibilityLabel: episode.title,
          accessibilityActions: [
            {
              name: "longpress",
              label: translate("demoPodcastListScreen.accessibility.favoriteAction"),
            },
          ],
          onAccessibilityAction: ({ nativeEvent }) => {
            if (nativeEvent.actionName === "longpress") {
              handlePressFavorite()
            }
          },
        },
      }),
    [episode, isFavorite],
  )

  const handlePressFavorite = () => {
    onPressFavorite()
    liked.value = withSpring(liked.value ? 0 : 1)
  }

  const handlePressCard = () => {
    openLinkInBrowser(episode.enclosure.link)
  }

  const ButtonLeftAccessory: ComponentType<ButtonAccessoryProps> = useMemo(
    () =>
      function ButtonLeftAccessory() {
        return (
          <View>
            <Animated.View
              style={[$iconContainer, StyleSheet.absoluteFill, animatedLikeButtonStyles]}
            >
              <Icon
                icon="heart"
                size={ICON_SIZE}
                color={colors.palette.neutral800} // dark grey
              />
            </Animated.View>
            <Animated.View style={[$iconContainer, animatedUnlikeButtonStyles]}>
              <Icon
                icon="heart"
                size={ICON_SIZE}
                color={colors.palette.primary400} // pink
              />
            </Animated.View>
          </View>
        )
      },
    [],
  )

  return (
    <Card
      style={$item}
      verticalAlignment="force-footer-bottom"
      onPress={handlePressCard}
      onLongPress={handlePressFavorite}
      HeadingComponent={
        <View style={$metadata}>
          <Text
            style={$metadataText}
            size="xxs"
            accessibilityLabel={episode.datePublished.accessibilityLabel}
          >
            {episode.datePublished.textLabel}
          </Text>
          <Text
            style={$metadataText}
            size="xxs"
            accessibilityLabel={episode.duration.accessibilityLabel}
          >
            {episode.duration.textLabel}
          </Text>
        </View>
      }
      content={`${episode.parsedTitleAndSubtitle.title} - ${episode.parsedTitleAndSubtitle.subtitle}`}
      {...accessibilityHintProps}
      RightComponent={<Image source={imageUri} style={$itemThumbnail} />}
      FooterComponent={
        <Button
          onPress={handlePressFavorite}
          onLongPress={handlePressFavorite}
          style={[$favoriteButton, isFavorite && $unFavoriteButton]}
          accessibilityLabel={
            isFavorite
              ? translate("demoPodcastListScreen.accessibility.unfavoriteIcon")
              : translate("demoPodcastListScreen.accessibility.favoriteIcon")
          }
          LeftAccessory={ButtonLeftAccessory}
        >
          <Text
            size="xxs"
            accessibilityLabel={episode.duration.accessibilityLabel}
            weight="medium"
            text={
              isFavorite
                ? translate("demoPodcastListScreen.unfavoriteButton")
                : translate("demoPodcastListScreen.favoriteButton")
            }
          />
        </Button>
      }
    />
  )
})

// #region Styles
const $screenContentContainer: ViewStyle = {
  flex: 1,
}

const $listContentContainer: ContentStyle = {
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg + spacing.xl,
  paddingBottom: spacing.lg,
}

const $heading: ViewStyle = {
  marginBottom: spacing.md,
}

const $item: ViewStyle = {
  padding: spacing.md,
  marginTop: spacing.md,
  minHeight: 120,
}

const $itemThumbnail: ImageStyle = {
  marginTop: spacing.sm,
  borderRadius: 50,
  alignSelf: "flex-start",
}

const $toggle: ViewStyle = {
  marginTop: spacing.md,
}

const $labelStyle: TextStyle = {
  textAlign: "left",
}

const $iconContainer: ViewStyle = {
  height: ICON_SIZE,
  width: ICON_SIZE,
  flexDirection: "row",
  marginEnd: spacing.sm,
}

const $metadata: TextStyle = {
  color: colors.textDim,
  marginTop: spacing.xs,
  flexDirection: "row",
}

const $metadataText: TextStyle = {
  color: colors.textDim,
  marginEnd: spacing.md,
  marginBottom: spacing.xs,
}

const $favoriteButton: ViewStyle = {
  borderRadius: 17,
  marginTop: spacing.md,
  justifyContent: "flex-start",
  backgroundColor: colors.palette.neutral300,
  borderColor: colors.palette.neutral300,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.xxxs,
  paddingBottom: 0,
  minHeight: 32,
  alignSelf: "flex-start",
}

const $unFavoriteButton: ViewStyle = {
  borderColor: colors.palette.primary100,
  backgroundColor: colors.palette.primary100,
}

const $emptyState: ViewStyle = {
  marginTop: spacing.xxl,
}

const $emptyStateImage: ImageStyle = {
  transform: [{ scaleX: isRTL ? -1 : 1 }],
}
// #endregion

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/DemoCommunityScreen.tsx

import React, { FC } from "react"
import { Image, ImageStyle, TextStyle, View, ViewStyle } from "react-native"
import { ListItem, Screen, Text } from "../components"
import { DemoTabScreenProps } from "../navigators/DemoNavigator"
import { spacing } from "../theme"
import { openLinkInBrowser } from "../utils/openLinkInBrowser"
import { isRTL } from "../i18n"

const chainReactLogo = require("../../assets/images/demo/cr-logo.png")
const reactNativeLiveLogo = require("../../assets/images/demo/rnl-logo.png")
const reactNativeRadioLogo = require("../../assets/images/demo/rnr-logo.png")
const reactNativeNewsletterLogo = require("../../assets/images/demo/rnn-logo.png")

export const DemoCommunityScreen: FC<DemoTabScreenProps<"DemoCommunity">> =
  function DemoCommunityScreen(_props) {
    return (
      <Screen preset="scroll" contentContainerStyle={$container} safeAreaEdges={["top"]}>
        <Text preset="heading" tx="demoCommunityScreen.title" style={$title} />
        <Text tx="demoCommunityScreen.tagLine" style={$tagline} />

        <Text preset="subheading" tx="demoCommunityScreen.joinUsOnSlackTitle" />
        <Text tx="demoCommunityScreen.joinUsOnSlack" style={$description} />
        <ListItem
          tx="demoCommunityScreen.joinSlackLink"
          leftIcon="slack"
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          onPress={() => openLinkInBrowser("https://community.infinite.red/")}
        />
        <Text
          preset="subheading"
          tx="demoCommunityScreen.makeIgniteEvenBetterTitle"
          style={$sectionTitle}
        />
        <Text tx="demoCommunityScreen.makeIgniteEvenBetter" style={$description} />
        <ListItem
          tx="demoCommunityScreen.contributeToIgniteLink"
          leftIcon="github"
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          onPress={() => openLinkInBrowser("https://github.com/infinitered/ignite")}
        />

        <Text
          preset="subheading"
          tx="demoCommunityScreen.theLatestInReactNativeTitle"
          style={$sectionTitle}
        />
        <Text tx="demoCommunityScreen.theLatestInReactNative" style={$description} />
        <ListItem
          tx="demoCommunityScreen.reactNativeRadioLink"
          bottomSeparator
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          LeftComponent={
            <View style={$logoContainer}>
              <Image source={reactNativeRadioLogo} style={$logo} />
            </View>
          }
          onPress={() => openLinkInBrowser("https://reactnativeradio.com/")}
        />
        <ListItem
          tx="demoCommunityScreen.reactNativeNewsletterLink"
          bottomSeparator
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          LeftComponent={
            <View style={$logoContainer}>
              <Image source={reactNativeNewsletterLogo} style={$logo} />
            </View>
          }
          onPress={() => openLinkInBrowser("https://reactnativenewsletter.com/")}
        />
        <ListItem
          tx="demoCommunityScreen.reactNativeLiveLink"
          bottomSeparator
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          LeftComponent={
            <View style={$logoContainer}>
              <Image source={reactNativeLiveLogo} style={$logo} />
            </View>
          }
          onPress={() => openLinkInBrowser("https://rn.live/")}
        />
        <ListItem
          tx="demoCommunityScreen.chainReactConferenceLink"
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          LeftComponent={
            <View style={$logoContainer}>
              <Image source={chainReactLogo} style={$logo} />
            </View>
          }
          onPress={() => openLinkInBrowser("https://cr.infinite.red/")}
        />
        <Text preset="subheading" tx="demoCommunityScreen.hireUsTitle" style={$sectionTitle} />
        <Text tx="demoCommunityScreen.hireUs" style={$description} />
        <ListItem
          tx="demoCommunityScreen.hireUsLink"
          leftIcon="clap"
          rightIcon={isRTL ? "caretLeft" : "caretRight"}
          onPress={() => openLinkInBrowser("https://infinite.red/contact")}
        />
      </Screen>
    )
  }

const $container: ViewStyle = {
  paddingTop: spacing.lg + spacing.xl,
  paddingHorizontal: spacing.lg,
}

const $title: TextStyle = {
  marginBottom: spacing.sm,
}

const $tagline: TextStyle = {
  marginBottom: spacing.xxl,
}

const $description: TextStyle = {
  marginBottom: spacing.lg,
}

const $sectionTitle: TextStyle = {
  marginTop: spacing.xxl,
}

const $logoContainer: ViewStyle = {
  marginEnd: spacing.md,
  flexDirection: "row",
  flexWrap: "wrap",
  alignContent: "center",
  alignSelf: "stretch",
}

const $logo: ImageStyle = {
  height: 38,
  width: 38,
}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/index.ts

export * from "./WelcomeScreen"
// @demo remove-block-start
export * from "./LoginScreen"
export * from "./DemoCommunityScreen"
export * from "./DemoDebugScreen"
export * from "./DemoShowroomScreen/DemoShowroomScreen"
// @demo remove-block-end
export * from "./ErrorScreen/ErrorBoundary"
// export other screens here

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/screens/LoginScreen.tsx

import { observer } from "mobx-react-lite"
import React, { ComponentType, FC, useEffect, useMemo, useRef, useState } from "react"
import { TextInput, TextStyle, ViewStyle } from "react-native"
import { Button, Icon, Screen, Text, TextField, TextFieldAccessoryProps } from "../components"
import { useStores } from "../models"
import { AppStackScreenProps } from "../navigators"
import { colors, spacing } from "../theme"

interface LoginScreenProps extends AppStackScreenProps<"Login"> {}

export const LoginScreen: FC<LoginScreenProps> = observer(function LoginScreen(_props) {
  const authPasswordInput = useRef<TextInput>(null)

  const [authPassword, setAuthPassword] = useState("")
  const [isAuthPasswordHidden, setIsAuthPasswordHidden] = useState(true)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [attemptsCount, setAttemptsCount] = useState(0)
  const {
    authenticationStore: { authEmail, setAuthEmail, setAuthToken, validationError },
  } = useStores()

  useEffect(() => {
    // Here is where you could fetch credentials from keychain or storage
    // and pre-fill the form fields.
    setAuthEmail("ignite@infinite.red")
    setAuthPassword("ign1teIsAwes0m3")

    // Return a "cleanup" function that React will run when the component unmounts
    return () => {
      setAuthPassword("")
      setAuthEmail("")
    }
  }, [])

  const error = isSubmitted ? validationError : ""

  function login() {
    setIsSubmitted(true)
    setAttemptsCount(attemptsCount + 1)

    if (validationError) return

    // Make a request to your server to get an authentication token.
    // If successful, reset the fields and set the token.
    setIsSubmitted(false)
    setAuthPassword("")
    setAuthEmail("")

    // We'll mock this with a fake token.
    setAuthToken(String(Date.now()))
  }

  const PasswordRightAccessory: ComponentType<TextFieldAccessoryProps> = useMemo(
    () =>
      function PasswordRightAccessory(props: TextFieldAccessoryProps) {
        return (
          <Icon
            icon={isAuthPasswordHidden ? "view" : "hidden"}
            color={colors.palette.neutral800}
            containerStyle={props.style}
            size={20}
            onPress={() => setIsAuthPasswordHidden(!isAuthPasswordHidden)}
          />
        )
      },
    [isAuthPasswordHidden],
  )

  return (
    <Screen
      preset="auto"
      contentContainerStyle={$screenContentContainer}
      safeAreaEdges={["top", "bottom"]}
    >
      <Text testID="login-heading" tx="loginScreen.logIn" preset="heading" style={$logIn} />
      <Text tx="loginScreen.enterDetails" preset="subheading" style={$enterDetails} />
      {attemptsCount > 2 && <Text tx="loginScreen.hint" size="sm" weight="light" style={$hint} />}

      <TextField
        value={authEmail}
        onChangeText={setAuthEmail}
        containerStyle={$textField}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        labelTx="loginScreen.emailFieldLabel"
        placeholderTx="loginScreen.emailFieldPlaceholder"
        helper={error}
        status={error ? "error" : undefined}
        onSubmitEditing={() => authPasswordInput.current?.focus()}
      />

      <TextField
        ref={authPasswordInput}
        value={authPassword}
        onChangeText={setAuthPassword}
        containerStyle={$textField}
        autoCapitalize="none"
        autoComplete="password"
        autoCorrect={false}
        secureTextEntry={isAuthPasswordHidden}
        labelTx="loginScreen.passwordFieldLabel"
        placeholderTx="loginScreen.passwordFieldPlaceholder"
        onSubmitEditing={login}
        RightAccessory={PasswordRightAccessory}
      />

      <Button
        testID="login-button"
        tx="loginScreen.tapToLogIn"
        style={$tapButton}
        preset="reversed"
        onPress={login}
      />
    </Screen>
  )
})

const $screenContentContainer: ViewStyle = {
  paddingVertical: spacing.xxl,
  paddingHorizontal: spacing.lg,
}

const $logIn: TextStyle = {
  marginBottom: spacing.sm,
}

const $enterDetails: TextStyle = {
  marginBottom: spacing.lg,
}

const $hint: TextStyle = {
  color: colors.tint,
  marginBottom: spacing.md,
}

const $textField: ViewStyle = {
  marginBottom: spacing.lg,
}

const $tapButton: ViewStyle = {
  marginTop: spacing.xs,
}

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Card.tsx

import React, { ComponentType, Fragment, ReactElement } from "react"
import {
  StyleProp,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"
import { colors, spacing } from "../theme"
import { Text, TextProps } from "./Text"

type Presets = keyof typeof $containerPresets

interface CardProps extends TouchableOpacityProps {
  /**
   * One of the different types of text presets.
   */
  preset?: Presets
  /**
   * How the content should be aligned vertically. This is especially (but not exclusively) useful
   * when the card is a fixed height but the content is dynamic.
   *
   * `top` (default) - aligns all content to the top.
   * `center` - aligns all content to the center.
   * `space-between` - spreads out the content evenly.
   * `force-footer-bottom` - aligns all content to the top, but forces the footer to the bottom.
   */
  verticalAlignment?: "top" | "center" | "space-between" | "force-footer-bottom"
  /**
   * Custom component added to the left of the card body.
   */
  LeftComponent?: ReactElement
  /**
   * Custom component added to the right of the card body.
   */
  RightComponent?: ReactElement
  /**
   * The heading text to display if not using `headingTx`.
   */
  heading?: TextProps["text"]
  /**
   * Heading text which is looked up via i18n.
   */
  headingTx?: TextProps["tx"]
  /**
   * Optional heading options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  headingTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for heading text.
   */
  headingStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the heading Text component.
   */
  HeadingTextProps?: TextProps
  /**
   * Custom heading component.
   * Overrides all other `heading*` props.
   */
  HeadingComponent?: ReactElement
  /**
   * The content text to display if not using `contentTx`.
   */
  content?: TextProps["text"]
  /**
   * Content text which is looked up via i18n.
   */
  contentTx?: TextProps["tx"]
  /**
   * Optional content options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  contentTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for content text.
   */
  contentStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the content Text component.
   */
  ContentTextProps?: TextProps
  /**
   * Custom content component.
   * Overrides all other `content*` props.
   */
  ContentComponent?: ReactElement
  /**
   * The footer text to display if not using `footerTx`.
   */
  footer?: TextProps["text"]
  /**
   * Footer text which is looked up via i18n.
   */
  footerTx?: TextProps["tx"]
  /**
   * Optional footer options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  footerTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for footer text.
   */
  footerStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the footer Text component.
   */
  FooterTextProps?: TextProps
  /**
   * Custom footer component.
   * Overrides all other `footer*` props.
   */
  FooterComponent?: ReactElement
}

/**
 * Cards are useful for displaying related information in a contained way.
 * If a ListItem displays content horizontally, a Card can be used to display content vertically.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Card/}
 * @param {CardProps} props - The props for the `Card` component.
 * @returns {JSX.Element} The rendered `Card` component.
 */
export function Card(props: CardProps) {
  const {
    content,
    contentTx,
    contentTxOptions,
    footer,
    footerTx,
    footerTxOptions,
    heading,
    headingTx,
    headingTxOptions,
    ContentComponent,
    HeadingComponent,
    FooterComponent,
    LeftComponent,
    RightComponent,
    verticalAlignment = "top",
    style: $containerStyleOverride,
    contentStyle: $contentStyleOverride,
    headingStyle: $headingStyleOverride,
    footerStyle: $footerStyleOverride,
    ContentTextProps,
    HeadingTextProps,
    FooterTextProps,
    ...WrapperProps
  } = props

  const preset: Presets = props.preset ?? "default"
  const isPressable = !!WrapperProps.onPress
  const isHeadingPresent = !!(HeadingComponent || heading || headingTx)
  const isContentPresent = !!(ContentComponent || content || contentTx)
  const isFooterPresent = !!(FooterComponent || footer || footerTx)

  const Wrapper = (isPressable ? TouchableOpacity : View) as ComponentType<
    TouchableOpacityProps | ViewProps
  >
  const HeaderContentWrapper = verticalAlignment === "force-footer-bottom" ? View : Fragment

  const $containerStyle = [$containerPresets[preset], $containerStyleOverride]
  const $headingStyle = [
    $headingPresets[preset],
    (isFooterPresent || isContentPresent) && { marginBottom: spacing.xxxs },
    $headingStyleOverride,
    HeadingTextProps?.style,
  ]
  const $contentStyle = [
    $contentPresets[preset],
    isHeadingPresent && { marginTop: spacing.xxxs },
    isFooterPresent && { marginBottom: spacing.xxxs },
    $contentStyleOverride,
    ContentTextProps?.style,
  ]
  const $footerStyle = [
    $footerPresets[preset],
    (isHeadingPresent || isContentPresent) && { marginTop: spacing.xxxs },
    $footerStyleOverride,
    FooterTextProps?.style,
  ]
  const $alignmentWrapperStyle = [
    $alignmentWrapper,
    { justifyContent: $alignmentWrapperFlexOptions[verticalAlignment] },
    LeftComponent && { marginStart: spacing.md },
    RightComponent && { marginEnd: spacing.md },
  ]

  return (
    <Wrapper
      style={$containerStyle}
      activeOpacity={0.8}
      accessibilityRole={isPressable ? "button" : undefined}
      {...WrapperProps}
    >
      {LeftComponent}

      <View style={$alignmentWrapperStyle}>
        <HeaderContentWrapper>
          {HeadingComponent ||
            (isHeadingPresent && (
              <Text
                weight="bold"
                text={heading}
                tx={headingTx}
                txOptions={headingTxOptions}
                {...HeadingTextProps}
                style={$headingStyle}
              />
            ))}

          {ContentComponent ||
            (isContentPresent && (
              <Text
                weight="normal"
                text={content}
                tx={contentTx}
                txOptions={contentTxOptions}
                {...ContentTextProps}
                style={$contentStyle}
              />
            ))}
        </HeaderContentWrapper>

        {FooterComponent ||
          (isFooterPresent && (
            <Text
              weight="normal"
              size="xs"
              text={footer}
              tx={footerTx}
              txOptions={footerTxOptions}
              {...FooterTextProps}
              style={$footerStyle}
            />
          ))}
      </View>

      {RightComponent}
    </Wrapper>
  )
}

const $containerBase: ViewStyle = {
  borderRadius: spacing.md,
  padding: spacing.xs,
  borderWidth: 1,
  shadowColor: colors.palette.neutral800,
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.08,
  shadowRadius: 12.81,
  elevation: 16,
  minHeight: 96,
  flexDirection: "row",
}

const $alignmentWrapper: ViewStyle = {
  flex: 1,
  alignSelf: "stretch",
}

const $alignmentWrapperFlexOptions = {
  top: "flex-start",
  center: "center",
  "space-between": "space-between",
  "force-footer-bottom": "space-between",
} as const

const $containerPresets = {
  default: [
    $containerBase,
    {
      backgroundColor: colors.palette.neutral100,
      borderColor: colors.palette.neutral300,
    },
  ] as StyleProp<ViewStyle>,

  reversed: [
    $containerBase,
    { backgroundColor: colors.palette.neutral800, borderColor: colors.palette.neutral500 },
  ] as StyleProp<ViewStyle>,
}

const $headingPresets: Record<Presets, TextStyle> = {
  default: {},
  reversed: { color: colors.palette.neutral100 },
}

const $contentPresets: Record<Presets, TextStyle> = {
  default: {},
  reversed: { color: colors.palette.neutral100 },
}

const $footerPresets: Record<Presets, TextStyle> = {
  default: {},
  reversed: { color: colors.palette.neutral100 },
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/AutoImage.tsx

import React, { useLayoutEffect, useState } from "react"
import { Image, ImageProps, ImageURISource, Platform } from "react-native"

export interface AutoImageProps extends ImageProps {
  /**
   * How wide should the image be?
   */
  maxWidth?: number
  /**
   * How tall should the image be?
   */
  maxHeight?: number
}

/**
 * A hook that will return the scaled dimensions of an image based on the
 * provided dimensions' aspect ratio. If no desired dimensions are provided,
 * it will return the original dimensions of the remote image.
 *
 * How is this different from `resizeMode: 'contain'`? Firstly, you can
 * specify only one side's size (not both). Secondly, the image will scale to fit
 * the desired dimensions instead of just being contained within its image-container.
 * @param {number} remoteUri - The URI of the remote image.
 * @param {number} dimensions - The desired dimensions of the image. If not provided, the original dimensions will be returned.
 * @returns {[number, number]} - The scaled dimensions of the image.
 */
export function useAutoImage(
  remoteUri: string,
  dimensions?: [maxWidth?: number, maxHeight?: number],
): [width: number, height: number] {
  const [[remoteWidth, remoteHeight], setRemoteImageDimensions] = useState([0, 0])
  const remoteAspectRatio = remoteWidth / remoteHeight
  const [maxWidth, maxHeight] = dimensions ?? []

  useLayoutEffect(() => {
    if (!remoteUri) return

    Image.getSize(remoteUri, (w, h) => setRemoteImageDimensions([w, h]))
  }, [remoteUri])

  if (Number.isNaN(remoteAspectRatio)) return [0, 0]

  if (maxWidth && maxHeight) {
    const aspectRatio = Math.min(maxWidth / remoteWidth, maxHeight / remoteHeight)
    return [remoteWidth * aspectRatio, remoteHeight * aspectRatio]
  } else if (maxWidth) {
    return [maxWidth, maxWidth / remoteAspectRatio]
  } else if (maxHeight) {
    return [maxHeight * remoteAspectRatio, maxHeight]
  } else {
    return [remoteWidth, remoteHeight]
  }
}

/**
 * An Image component that automatically sizes a remote or data-uri image.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/AutoImage/}
 * @param {AutoImageProps} props - The props for the `AutoImage` component.
 * @returns {JSX.Element} The rendered `AutoImage` component.
 */
export function AutoImage(props: AutoImageProps) {
  const { maxWidth, maxHeight, ...ImageProps } = props
  const source = props.source as ImageURISource

  const [width, height] = useAutoImage(
    Platform.select({
      web: (source?.uri as string) ?? (source as string),
      default: source?.uri as string,
    }),
    [maxWidth, maxHeight],
  )

  return <Image {...ImageProps} style={[{ width, height }, props.style]} />
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Icon.tsx

import * as React from "react"
import { ComponentType } from "react"
import {
  Image,
  ImageStyle,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"

export type IconTypes = keyof typeof iconRegistry

interface IconProps extends TouchableOpacityProps {
  /**
   * The name of the icon
   */
  icon: IconTypes

  /**
   * An optional tint color for the icon
   */
  color?: string

  /**
   * An optional size for the icon. If not provided, the icon will be sized to the icon's resolution.
   */
  size?: number

  /**
   * Style overrides for the icon image
   */
  style?: StyleProp<ImageStyle>

  /**
   * Style overrides for the icon container
   */
  containerStyle?: StyleProp<ViewStyle>

  /**
   * An optional function to be called when the icon is pressed
   */
  onPress?: TouchableOpacityProps["onPress"]
}

/**
 * A component to render a registered icon.
 * It is wrapped in a <TouchableOpacity /> if `onPress` is provided, otherwise a <View />.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Icon/}
 * @param {IconProps} props - The props for the `Icon` component.
 * @returns {JSX.Element} The rendered `Icon` component.
 */
export function Icon(props: IconProps) {
  const {
    icon,
    color,
    size,
    style: $imageStyleOverride,
    containerStyle: $containerStyleOverride,
    ...WrapperProps
  } = props

  const isPressable = !!WrapperProps.onPress
  const Wrapper = (WrapperProps?.onPress ? TouchableOpacity : View) as ComponentType<
    TouchableOpacityProps | ViewProps
  >

  const $imageStyle: StyleProp<ImageStyle> = [
    $imageStyleBase,
    color !== undefined && { tintColor: color },
    size !== undefined && { width: size, height: size },
    $imageStyleOverride,
  ]

  return (
    <Wrapper
      accessibilityRole={isPressable ? "imagebutton" : undefined}
      {...WrapperProps}
      style={$containerStyleOverride}
    >
      <Image style={$imageStyle} source={iconRegistry[icon]} />
    </Wrapper>
  )
}

export const iconRegistry = {
  back: require("../../assets/icons/back.png"),
  bell: require("../../assets/icons/bell.png"),
  caretLeft: require("../../assets/icons/caretLeft.png"),
  caretRight: require("../../assets/icons/caretRight.png"),
  check: require("../../assets/icons/check.png"),
  clap: require("../../assets/icons/demo/clap.png"), // @demo remove-current-line
  community: require("../../assets/icons/demo/community.png"), // @demo remove-current-line
  components: require("../../assets/icons/demo/components.png"), // @demo remove-current-line
  debug: require("../../assets/icons/demo/debug.png"), // @demo remove-current-line
  github: require("../../assets/icons/demo/github.png"), // @demo remove-current-line
  heart: require("../../assets/icons/demo/heart.png"), // @demo remove-current-line
  hidden: require("../../assets/icons/hidden.png"),
  ladybug: require("../../assets/icons/ladybug.png"),
  lock: require("../../assets/icons/lock.png"),
  menu: require("../../assets/icons/menu.png"),
  more: require("../../assets/icons/more.png"),
  pin: require("../../assets/icons/demo/pin.png"), // @demo remove-current-line
  podcast: require("../../assets/icons/demo/podcast.png"), // @demo remove-current-line
  settings: require("../../assets/icons/settings.png"),
  slack: require("../../assets/icons/demo/slack.png"), // @demo remove-current-line
  view: require("../../assets/icons/view.png"),
  x: require("../../assets/icons/x.png"),
}

const $imageStyleBase: ImageStyle = {
  resizeMode: "contain",
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/TextField.tsx

import React, { ComponentType, forwardRef, Ref, useImperativeHandle, useRef } from "react"
import {
  StyleProp,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native"
import { isRTL, translate } from "../i18n"
import { colors, spacing, typography } from "../theme"
import { Text, TextProps } from "./Text"

export interface TextFieldAccessoryProps {
  style: StyleProp<any>
  status: TextFieldProps["status"]
  multiline: boolean
  editable: boolean
}

export interface TextFieldProps extends Omit<TextInputProps, "ref"> {
  /**
   * A style modifier for different input states.
   */
  status?: "error" | "disabled"
  /**
   * The label text to display if not using `labelTx`.
   */
  label?: TextProps["text"]
  /**
   * Label text which is looked up via i18n.
   */
  labelTx?: TextProps["tx"]
  /**
   * Optional label options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  labelTxOptions?: TextProps["txOptions"]
  /**
   * Pass any additional props directly to the label Text component.
   */
  LabelTextProps?: TextProps
  /**
   * The helper text to display if not using `helperTx`.
   */
  helper?: TextProps["text"]
  /**
   * Helper text which is looked up via i18n.
   */
  helperTx?: TextProps["tx"]
  /**
   * Optional helper options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  helperTxOptions?: TextProps["txOptions"]
  /**
   * Pass any additional props directly to the helper Text component.
   */
  HelperTextProps?: TextProps
  /**
   * The placeholder text to display if not using `placeholderTx`.
   */
  placeholder?: TextProps["text"]
  /**
   * Placeholder text which is looked up via i18n.
   */
  placeholderTx?: TextProps["tx"]
  /**
   * Optional placeholder options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  placeholderTxOptions?: TextProps["txOptions"]
  /**
   * Optional input style override.
   */
  style?: StyleProp<TextStyle>
  /**
   * Style overrides for the container
   */
  containerStyle?: StyleProp<ViewStyle>
  /**
   * Style overrides for the input wrapper
   */
  inputWrapperStyle?: StyleProp<ViewStyle>
  /**
   * An optional component to render on the right side of the input.
   * Example: `RightAccessory={(props) => <Icon icon="ladybug" containerStyle={props.style} color={props.editable ? colors.textDim : colors.text} />}`
   * Note: It is a good idea to memoize this.
   */
  RightAccessory?: ComponentType<TextFieldAccessoryProps>
  /**
   * An optional component to render on the left side of the input.
   * Example: `LeftAccessory={(props) => <Icon icon="ladybug" containerStyle={props.style} color={props.editable ? colors.textDim : colors.text} />}`
   * Note: It is a good idea to memoize this.
   */
  LeftAccessory?: ComponentType<TextFieldAccessoryProps>
}

/**
 * A component that allows for the entering and editing of text.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/TextField/}
 * @param {TextFieldProps} props - The props for the `TextField` component.
 * @returns {JSX.Element} The rendered `TextField` component.
 */
export const TextField = forwardRef(function TextField(props: TextFieldProps, ref: Ref<TextInput>) {
  const {
    labelTx,
    label,
    labelTxOptions,
    placeholderTx,
    placeholder,
    placeholderTxOptions,
    helper,
    helperTx,
    helperTxOptions,
    status,
    RightAccessory,
    LeftAccessory,
    HelperTextProps,
    LabelTextProps,
    style: $inputStyleOverride,
    containerStyle: $containerStyleOverride,
    inputWrapperStyle: $inputWrapperStyleOverride,
    ...TextInputProps
  } = props
  const input = useRef<TextInput>(null)

  const disabled = TextInputProps.editable === false || status === "disabled"

  const placeholderContent = placeholderTx
    ? translate(placeholderTx, placeholderTxOptions)
    : placeholder

  const $containerStyles = [$containerStyleOverride]

  const $labelStyles = [$labelStyle, LabelTextProps?.style]

  const $inputWrapperStyles = [
    $inputWrapperStyle,
    status === "error" && { borderColor: colors.error },
    TextInputProps.multiline && { minHeight: 112 },
    LeftAccessory && { paddingStart: 0 },
    RightAccessory && { paddingEnd: 0 },
    $inputWrapperStyleOverride,
  ]

  const $inputStyles: StyleProp<TextStyle> = [
    $inputStyle,
    disabled && { color: colors.textDim },
    isRTL && { textAlign: "right" as TextStyle["textAlign"] },
    TextInputProps.multiline && { height: "auto" },
    $inputStyleOverride,
  ]

  const $helperStyles = [
    $helperStyle,
    status === "error" && { color: colors.error },
    HelperTextProps?.style,
  ]

  /**
   *
   */
  function focusInput() {
    if (disabled) return

    input.current?.focus()
  }

  useImperativeHandle(ref, () => input.current as TextInput)

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={$containerStyles}
      onPress={focusInput}
      accessibilityState={{ disabled }}
    >
      {!!(label || labelTx) && (
        <Text
          preset="formLabel"
          text={label}
          tx={labelTx}
          txOptions={labelTxOptions}
          {...LabelTextProps}
          style={$labelStyles}
        />
      )}

      <View style={$inputWrapperStyles}>
        {!!LeftAccessory && (
          <LeftAccessory
            style={$leftAccessoryStyle}
            status={status}
            editable={!disabled}
            multiline={TextInputProps.multiline ?? false}
          />
        )}

        <TextInput
          ref={input}
          underlineColorAndroid={colors.transparent}
          textAlignVertical="top"
          placeholder={placeholderContent}
          placeholderTextColor={colors.textDim}
          {...TextInputProps}
          editable={!disabled}
          style={$inputStyles}
        />

        {!!RightAccessory && (
          <RightAccessory
            style={$rightAccessoryStyle}
            status={status}
            editable={!disabled}
            multiline={TextInputProps.multiline ?? false}
          />
        )}
      </View>

      {!!(helper || helperTx) && (
        <Text
          preset="formHelper"
          text={helper}
          tx={helperTx}
          txOptions={helperTxOptions}
          {...HelperTextProps}
          style={$helperStyles}
        />
      )}
    </TouchableOpacity>
  )
})

const $labelStyle: TextStyle = {
  marginBottom: spacing.xs,
}

const $inputWrapperStyle: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
  borderWidth: 1,
  borderRadius: 4,
  backgroundColor: colors.palette.neutral200,
  borderColor: colors.palette.neutral400,
  overflow: "hidden",
}

const $inputStyle: TextStyle = {
  flex: 1,
  alignSelf: "stretch",
  fontFamily: typography.primary.normal,
  color: colors.text,
  fontSize: 16,
  height: 24,
  // https://github.com/facebook/react-native/issues/21720#issuecomment-532642093
  paddingVertical: 0,
  paddingHorizontal: 0,
  marginVertical: spacing.xs,
  marginHorizontal: spacing.sm,
}

const $helperStyle: TextStyle = {
  marginTop: spacing.xs,
}

const $rightAccessoryStyle: ViewStyle = {
  marginEnd: spacing.xs,
  height: 40,
  justifyContent: "center",
  alignItems: "center",
}
const $leftAccessoryStyle: ViewStyle = {
  marginStart: spacing.xs,
  height: 40,
  justifyContent: "center",
  alignItems: "center",
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Screen.tsx

import { useScrollToTop } from "@react-navigation/native"
import { StatusBar, StatusBarProps } from "expo-status-bar"
import React, { useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native"
import { colors } from "../theme"
import { ExtendedEdge, useSafeAreaInsetsStyle } from "../utils/useSafeAreaInsetsStyle"

interface BaseScreenProps {
  /**
   * Children components.
   */
  children?: React.ReactNode
  /**
   * Style for the outer content container useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>
  /**
   * Style for the inner content container useful for padding & margin.
   */
  contentContainerStyle?: StyleProp<ViewStyle>
  /**
   * Override the default edges for the safe area.
   */
  safeAreaEdges?: ExtendedEdge[]
  /**
   * Background color
   */
  backgroundColor?: string
  /**
   * Status bar setting. Defaults to dark.
   */
  statusBarStyle?: "light" | "dark"
  /**
   * By how much should we offset the keyboard? Defaults to 0.
   */
  keyboardOffset?: number
  /**
   * Pass any additional props directly to the StatusBar component.
   */
  StatusBarProps?: StatusBarProps
  /**
   * Pass any additional props directly to the KeyboardAvoidingView component.
   */
  KeyboardAvoidingViewProps?: KeyboardAvoidingViewProps
}

interface FixedScreenProps extends BaseScreenProps {
  preset?: "fixed"
}
interface ScrollScreenProps extends BaseScreenProps {
  preset?: "scroll"
  /**
   * Should keyboard persist on screen tap. Defaults to handled.
   * Only applies to scroll preset.
   */
  keyboardShouldPersistTaps?: "handled" | "always" | "never"
  /**
   * Pass any additional props directly to the ScrollView component.
   */
  ScrollViewProps?: ScrollViewProps
}

interface AutoScreenProps extends Omit<ScrollScreenProps, "preset"> {
  preset?: "auto"
  /**
   * Threshold to trigger the automatic disabling/enabling of scroll ability.
   * Defaults to `{ percent: 0.92 }`.
   */
  scrollEnabledToggleThreshold?: { percent?: number; point?: number }
}

export type ScreenProps = ScrollScreenProps | FixedScreenProps | AutoScreenProps

const isIos = Platform.OS === "ios"

type ScreenPreset = "fixed" | "scroll" | "auto"

/**
 * @param {ScreenPreset?} preset - The preset to check.
 * @returns {boolean} - Whether the preset is non-scrolling.
 */
function isNonScrolling(preset?: ScreenPreset) {
  return !preset || preset === "fixed"
}

/**
 * Custom hook that handles the automatic enabling/disabling of scroll ability based on the content size and screen size.
 * @param {UseAutoPresetProps} props - The props for the `useAutoPreset` hook.
 * @returns {{boolean, Function, Function}} - The scroll state, and the `onContentSizeChange` and `onLayout` functions.
 */
function useAutoPreset(props: AutoScreenProps): {
  scrollEnabled: boolean
  onContentSizeChange: (w: number, h: number) => void
  onLayout: (e: LayoutChangeEvent) => void
} {
  const { preset, scrollEnabledToggleThreshold } = props
  const { percent = 0.92, point = 0 } = scrollEnabledToggleThreshold || {}

  const scrollViewHeight = useRef<null | number>(null)
  const scrollViewContentHeight = useRef<null | number>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)

  function updateScrollState() {
    if (scrollViewHeight.current === null || scrollViewContentHeight.current === null) return

    // check whether content fits the screen then toggle scroll state according to it
    const contentFitsScreen = (function () {
      if (point) {
        return scrollViewContentHeight.current < scrollViewHeight.current - point
      } else {
        return scrollViewContentHeight.current < scrollViewHeight.current * percent
      }
    })()

    // content is less than the size of the screen, so we can disable scrolling
    if (scrollEnabled && contentFitsScreen) setScrollEnabled(false)

    // content is greater than the size of the screen, so let's enable scrolling
    if (!scrollEnabled && !contentFitsScreen) setScrollEnabled(true)
  }

  /**
   * @param {number} w - The width of the content.
   * @param {number} h - The height of the content.
   */
  function onContentSizeChange(w: number, h: number) {
    // update scroll-view content height
    scrollViewContentHeight.current = h
    updateScrollState()
  }

  /**
   * @param {LayoutChangeEvent} e = The layout change event.
   */
  function onLayout(e: LayoutChangeEvent) {
    const { height } = e.nativeEvent.layout
    // update scroll-view  height
    scrollViewHeight.current = height
    updateScrollState()
  }

  // update scroll state on every render
  if (preset === "auto") updateScrollState()

  return {
    scrollEnabled: preset === "auto" ? scrollEnabled : true,
    onContentSizeChange,
    onLayout,
  }
}

/**
 * @param {ScreenProps} props - The props for the `ScreenWithoutScrolling` component.
 * @returns {JSX.Element} - The rendered `ScreenWithoutScrolling` component.
 */
function ScreenWithoutScrolling(props: ScreenProps) {
  const { style, contentContainerStyle, children } = props
  return (
    <View style={[$outerStyle, style]}>
      <View style={[$innerStyle, contentContainerStyle]}>{children}</View>
    </View>
  )
}

/**
 * @param {ScreenProps} props - The props for the `ScreenWithScrolling` component.
 * @returns {JSX.Element} - The rendered `ScreenWithScrolling` component.
 */
function ScreenWithScrolling(props: ScreenProps) {
  const {
    children,
    keyboardShouldPersistTaps = "handled",
    contentContainerStyle,
    ScrollViewProps,
    style,
  } = props as ScrollScreenProps

  const ref = useRef<ScrollView>(null)

  const { scrollEnabled, onContentSizeChange, onLayout } = useAutoPreset(props as AutoScreenProps)

  // Add native behavior of pressing the active tab to scroll to the top of the content
  // More info at: https://reactnavigation.org/docs/use-scroll-to-top/
  useScrollToTop(ref)

  return (
    <ScrollView
      {...{ keyboardShouldPersistTaps, scrollEnabled, ref }}
      {...ScrollViewProps}
      onLayout={(e) => {
        onLayout(e)
        ScrollViewProps?.onLayout?.(e)
      }}
      onContentSizeChange={(w: number, h: number) => {
        onContentSizeChange(w, h)
        ScrollViewProps?.onContentSizeChange?.(w, h)
      }}
      style={[$outerStyle, ScrollViewProps?.style, style]}
      contentContainerStyle={[
        $innerStyle,
        ScrollViewProps?.contentContainerStyle,
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  )
}

/**
 * Represents a screen component that provides a consistent layout and behavior for different screen presets.
 * The `Screen` component can be used with different presets such as "fixed", "scroll", or "auto".
 * It handles safe area insets, status bar settings, keyboard avoiding behavior, and scrollability based on the preset.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/app/components/Screen/}
 * @param {ScreenProps} props - The props for the `Screen` component.
 * @returns {JSX.Element} The rendered `Screen` component.
 */
export function Screen(props: ScreenProps) {
  const {
    backgroundColor = colors.background,
    KeyboardAvoidingViewProps,
    keyboardOffset = 0,
    safeAreaEdges,
    StatusBarProps,
    statusBarStyle = "dark",
  } = props

  const $containerInsets = useSafeAreaInsetsStyle(safeAreaEdges)

  return (
    <View style={[$containerStyle, { backgroundColor }, $containerInsets]}>
      <StatusBar style={statusBarStyle} {...StatusBarProps} />

      <KeyboardAvoidingView
        behavior={isIos ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
        {...KeyboardAvoidingViewProps}
        style={[$keyboardAvoidingViewStyle, KeyboardAvoidingViewProps?.style]}
      >
        {isNonScrolling(props.preset) ? (
          <ScreenWithoutScrolling {...props} />
        ) : (
          <ScreenWithScrolling {...props} />
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const $containerStyle: ViewStyle = {
  flex: 1,
  height: "100%",
  width: "100%",
}

const $keyboardAvoidingViewStyle: ViewStyle = {
  flex: 1,
}

const $outerStyle: ViewStyle = {
  flex: 1,
  height: "100%",
  width: "100%",
}

const $innerStyle: ViewStyle = {
  justifyContent: "flex-start",
  alignItems: "stretch",
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Header.tsx

import React, { ReactElement } from "react"
import {
  StyleProp,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from "react-native"
import { isRTL, translate } from "../i18n"
import { colors, spacing } from "../theme"
import { ExtendedEdge, useSafeAreaInsetsStyle } from "../utils/useSafeAreaInsetsStyle"
import { Icon, IconTypes } from "./Icon"
import { Text, TextProps } from "./Text"

export interface HeaderProps {
  /**
   * The layout of the title relative to the action components.
   * - `center` will force the title to always be centered relative to the header. If the title or the action buttons are too long, the title will be cut off.
   * - `flex` will attempt to center the title relative to the action buttons. If the action buttons are different widths, the title will be off-center relative to the header.
   */
  titleMode?: "center" | "flex"
  /**
   * Optional title style override.
   */
  titleStyle?: StyleProp<TextStyle>
  /**
   * Optional outer title container style override.
   */
  titleContainerStyle?: StyleProp<ViewStyle>
  /**
   * Optional inner header wrapper style override.
   */
  style?: StyleProp<ViewStyle>
  /**
   * Optional outer header container style override.
   */
  containerStyle?: StyleProp<ViewStyle>
  /**
   * Background color
   */
  backgroundColor?: string
  /**
   * Title text to display if not using `tx` or nested components.
   */
  title?: TextProps["text"]
  /**
   * Title text which is looked up via i18n.
   */
  titleTx?: TextProps["tx"]
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  titleTxOptions?: TextProps["txOptions"]
  /**
   * Icon that should appear on the left.
   * Can be used with `onLeftPress`.
   */
  leftIcon?: IconTypes
  /**
   * An optional tint color for the left icon
   */
  leftIconColor?: string
  /**
   * Left action text to display if not using `leftTx`.
   * Can be used with `onLeftPress`. Overrides `leftIcon`.
   */
  leftText?: TextProps["text"]
  /**
   * Left action text text which is looked up via i18n.
   * Can be used with `onLeftPress`. Overrides `leftIcon`.
   */
  leftTx?: TextProps["tx"]
  /**
   * Left action custom ReactElement if the built in action props don't suffice.
   * Overrides `leftIcon`, `leftTx` and `leftText`.
   */
  LeftActionComponent?: ReactElement
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  leftTxOptions?: TextProps["txOptions"]
  /**
   * What happens when you press the left icon or text action.
   */
  onLeftPress?: TouchableOpacityProps["onPress"]
  /**
   * Icon that should appear on the right.
   * Can be used with `onRightPress`.
   */
  rightIcon?: IconTypes
  /**
   * An optional tint color for the right icon
   */
  rightIconColor?: string
  /**
   * Right action text to display if not using `rightTx`.
   * Can be used with `onRightPress`. Overrides `rightIcon`.
   */
  rightText?: TextProps["text"]
  /**
   * Right action text text which is looked up via i18n.
   * Can be used with `onRightPress`. Overrides `rightIcon`.
   */
  rightTx?: TextProps["tx"]
  /**
   * Right action custom ReactElement if the built in action props don't suffice.
   * Overrides `rightIcon`, `rightTx` and `rightText`.
   */
  RightActionComponent?: ReactElement
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  rightTxOptions?: TextProps["txOptions"]
  /**
   * What happens when you press the right icon or text action.
   */
  onRightPress?: TouchableOpacityProps["onPress"]
  /**
   * Override the default edges for the safe area.
   */
  safeAreaEdges?: ExtendedEdge[]
}

interface HeaderActionProps {
  backgroundColor?: string
  icon?: IconTypes
  iconColor?: string
  text?: TextProps["text"]
  tx?: TextProps["tx"]
  txOptions?: TextProps["txOptions"]
  onPress?: TouchableOpacityProps["onPress"]
  ActionComponent?: ReactElement
}

/**
 * Header that appears on many screens. Will hold navigation buttons and screen title.
 * The Header is meant to be used with the `screenOptions.header` option on navigators, routes, or screen components via `navigation.setOptions({ header })`.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Header/}
 * @param {HeaderProps} props - The props for the `Header` component.
 * @returns {JSX.Element} The rendered `Header` component.
 */
export function Header(props: HeaderProps) {
  const {
    backgroundColor = colors.background,
    LeftActionComponent,
    leftIcon,
    leftIconColor,
    leftText,
    leftTx,
    leftTxOptions,
    onLeftPress,
    onRightPress,
    RightActionComponent,
    rightIcon,
    rightIconColor,
    rightText,
    rightTx,
    rightTxOptions,
    safeAreaEdges = ["top"],
    title,
    titleMode = "center",
    titleTx,
    titleTxOptions,
    titleContainerStyle: $titleContainerStyleOverride,
    style: $styleOverride,
    titleStyle: $titleStyleOverride,
    containerStyle: $containerStyleOverride,
  } = props

  const $containerInsets = useSafeAreaInsetsStyle(safeAreaEdges)

  const titleContent = titleTx ? translate(titleTx, titleTxOptions) : title

  return (
    <View style={[$container, $containerInsets, { backgroundColor }, $containerStyleOverride]}>
      <View style={[$wrapper, $styleOverride]}>
        <HeaderAction
          tx={leftTx}
          text={leftText}
          icon={leftIcon}
          iconColor={leftIconColor}
          onPress={onLeftPress}
          txOptions={leftTxOptions}
          backgroundColor={backgroundColor}
          ActionComponent={LeftActionComponent}
        />

        {!!titleContent && (
          <View
            style={[
              titleMode === "center" && $titleWrapperCenter,
              titleMode === "flex" && $titleWrapperFlex,
              $titleContainerStyleOverride,
            ]}
            pointerEvents="none"
          >
            <Text
              weight="medium"
              size="md"
              text={titleContent}
              style={[$title, $titleStyleOverride]}
            />
          </View>
        )}

        <HeaderAction
          tx={rightTx}
          text={rightText}
          icon={rightIcon}
          iconColor={rightIconColor}
          onPress={onRightPress}
          txOptions={rightTxOptions}
          backgroundColor={backgroundColor}
          ActionComponent={RightActionComponent}
        />
      </View>
    </View>
  )
}

/**
 * @param {HeaderActionProps} props - The props for the `HeaderAction` component.
 * @returns {JSX.Element} The rendered `HeaderAction` component.
 */
function HeaderAction(props: HeaderActionProps) {
  const { backgroundColor, icon, text, tx, txOptions, onPress, ActionComponent, iconColor } = props

  const content = tx ? translate(tx, txOptions) : text

  if (ActionComponent) return ActionComponent

  if (content) {
    return (
      <TouchableOpacity
        style={[$actionTextContainer, { backgroundColor }]}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.8}
      >
        <Text weight="medium" size="md" text={content} style={$actionText} />
      </TouchableOpacity>
    )
  }

  if (icon) {
    return (
      <Icon
        size={24}
        icon={icon}
        color={iconColor}
        onPress={onPress}
        containerStyle={[$actionIconContainer, { backgroundColor }]}
        style={isRTL ? { transform: [{ rotate: "180deg" }] } : {}}
      />
    )
  }

  return <View style={[$actionFillerContainer, { backgroundColor }]} />
}

const $wrapper: ViewStyle = {
  height: 56,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
}

const $container: ViewStyle = {
  width: "100%",
}

const $title: TextStyle = {
  textAlign: "center",
}

const $actionTextContainer: ViewStyle = {
  flexGrow: 0,
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  paddingHorizontal: spacing.md,
  zIndex: 2,
}

const $actionText: TextStyle = {
  color: colors.tint,
}

const $actionIconContainer: ViewStyle = {
  flexGrow: 0,
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  paddingHorizontal: spacing.md,
  zIndex: 2,
}

const $actionFillerContainer: ViewStyle = {
  width: 16,
}

const $titleWrapperCenter: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  width: "100%",
  position: "absolute",
  paddingHorizontal: spacing.xxl,
  zIndex: 1,
}

const $titleWrapperFlex: ViewStyle = {
  justifyContent: "center",
  flexGrow: 1,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/ListItem.tsx

import React, { ReactElement } from "react"
import {
  StyleProp,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from "react-native"
import { colors, spacing } from "../theme"
import { Icon, IconTypes } from "./Icon"
import { Text, TextProps } from "./Text"

export interface ListItemProps extends TouchableOpacityProps {
  /**
   * How tall the list item should be.
   * Default: 56
   */
  height?: number
  /**
   * Whether to show the top separator.
   * Default: false
   */
  topSeparator?: boolean
  /**
   * Whether to show the bottom separator.
   * Default: false
   */
  bottomSeparator?: boolean
  /**
   * Text to display if not using `tx` or nested components.
   */
  text?: TextProps["text"]
  /**
   * Text which is looked up via i18n.
   */
  tx?: TextProps["tx"]
  /**
   * Children components.
   */
  children?: TextProps["children"]
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  txOptions?: TextProps["txOptions"]
  /**
   * Optional text style override.
   */
  textStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the Text component.
   */
  TextProps?: TextProps
  /**
   * Optional View container style override.
   */
  containerStyle?: StyleProp<ViewStyle>
  /**
   * Optional TouchableOpacity style override.
   */
  style?: StyleProp<ViewStyle>
  /**
   * Icon that should appear on the left.
   */
  leftIcon?: IconTypes
  /**
   * An optional tint color for the left icon
   */
  leftIconColor?: string
  /**
   * Icon that should appear on the right.
   */
  rightIcon?: IconTypes
  /**
   * An optional tint color for the right icon
   */
  rightIconColor?: string
  /**
   * Right action custom ReactElement.
   * Overrides `rightIcon`.
   */
  RightComponent?: ReactElement
  /**
   * Left action custom ReactElement.
   * Overrides `leftIcon`.
   */
  LeftComponent?: ReactElement
}

interface ListItemActionProps {
  icon?: IconTypes
  iconColor?: string
  Component?: ReactElement
  size: number
  side: "left" | "right"
}

/**
 * A styled row component that can be used in FlatList, SectionList, or by itself.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/ListItem/}
 * @param {ListItemProps} props - The props for the `ListItem` component.
 * @returns {JSX.Element} The rendered `ListItem` component.
 */
export function ListItem(props: ListItemProps) {
  const {
    bottomSeparator,
    children,
    height = 56,
    LeftComponent,
    leftIcon,
    leftIconColor,
    RightComponent,
    rightIcon,
    rightIconColor,
    style,
    text,
    TextProps,
    topSeparator,
    tx,
    txOptions,
    textStyle: $textStyleOverride,
    containerStyle: $containerStyleOverride,
    ...TouchableOpacityProps
  } = props

  const $textStyles = [$textStyle, $textStyleOverride, TextProps?.style]

  const $containerStyles = [
    topSeparator && $separatorTop,
    bottomSeparator && $separatorBottom,
    $containerStyleOverride,
  ]

  const $touchableStyles = [$touchableStyle, { minHeight: height }, style]

  return (
    <View style={$containerStyles}>
      <TouchableOpacity {...TouchableOpacityProps} style={$touchableStyles}>
        <ListItemAction
          side="left"
          size={height}
          icon={leftIcon}
          iconColor={leftIconColor}
          Component={LeftComponent}
        />

        <Text {...TextProps} tx={tx} text={text} txOptions={txOptions} style={$textStyles}>
          {children}
        </Text>

        <ListItemAction
          side="right"
          size={height}
          icon={rightIcon}
          iconColor={rightIconColor}
          Component={RightComponent}
        />
      </TouchableOpacity>
    </View>
  )
}

/**
 * @param {ListItemActionProps} props - The props for the `ListItemAction` component.
 * @returns {JSX.Element | null} The rendered `ListItemAction` component.
 */
function ListItemAction(props: ListItemActionProps) {
  const { icon, Component, iconColor, size, side } = props

  const $iconContainerStyles = [$iconContainer]

  if (Component) return Component

  if (icon !== undefined) {
    return (
      <Icon
        size={24}
        icon={icon}
        color={iconColor}
        containerStyle={[
          $iconContainerStyles,
          side === "left" && $iconContainerLeft,
          side === "right" && $iconContainerRight,
          { height: size },
        ]}
      />
    )
  }

  return null
}

const $separatorTop: ViewStyle = {
  borderTopWidth: 1,
  borderTopColor: colors.separator,
}

const $separatorBottom: ViewStyle = {
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
}

const $textStyle: TextStyle = {
  paddingVertical: spacing.xs,
  alignSelf: "center",
  flexGrow: 1,
  flexShrink: 1,
}

const $touchableStyle: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
}

const $iconContainer: ViewStyle = {
  justifyContent: "center",
  alignItems: "center",
  flexGrow: 0,
}
const $iconContainerLeft: ViewStyle = {
  marginEnd: spacing.md,
}

const $iconContainerRight: ViewStyle = {
  marginStart: spacing.md,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/index.ts

export * from "./AutoImage"
export * from "./Button"
export * from "./Card"
export * from "./Header"
export * from "./Icon"
export * from "./ListItem"
export * from "./ListView"
export * from "./Screen"
export * from "./Text"
export * from "./TextField"
export * from "./Toggle"
export * from "./EmptyState"

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/ListView.tsx

import React, { forwardRef, PropsWithoutRef } from "react"
import { FlatList } from "react-native"
import { isRTL } from "app/i18n"
import { FlashList, FlashListProps } from "@shopify/flash-list"

export type ListViewRef<T> = FlashList<T> | FlatList<T>

export type ListViewProps<T> = PropsWithoutRef<FlashListProps<T>>

/**
 * This is a Higher Order Component meant to ease the pain of using @shopify/flash-list
 * when there is a chance that a user would have their device language set to an
 * RTL language like Arabic or Punjabi. This component will use react-native's
 * FlatList if the user's language is RTL or FlashList if the user's language is LTR.
 *
 * Because FlashList's props are a superset of FlatList's, you must pass estimatedItemSize
 * to this component if you want to use it.
 *
 * This is a temporary workaround until the FlashList component supports RTL at
 * which point this component can be removed and we will default to using FlashList everywhere.
 * @see {@link https://github.com/Shopify/flash-list/issues/544|RTL Bug Android}
 * @see {@link https://github.com/Shopify/flash-list/issues/840|Flashlist Not Support RTL}
 * @param {FlashListProps | FlatListProps} props - The props for the `ListView` component.
 * @param {React.RefObject<ListViewRef>} forwardRef - An optional forwarded ref.
 * @returns {JSX.Element} The rendered `ListView` component.
 */
const ListViewComponent = forwardRef(
  <T,>(props: ListViewProps<T>, ref: React.ForwardedRef<ListViewRef<T>>) => {
    const ListComponentWrapper = isRTL ? FlatList : FlashList

    return <ListComponentWrapper {...props} ref={ref} />
  },
)

ListViewComponent.displayName = "ListView"

export const ListView = ListViewComponent as <T>(
  props: ListViewProps<T> & {
    ref?: React.RefObject<ListViewRef<T>>
  },
) => React.ReactElement

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Text.test.tsx

import { render } from "@testing-library/react-native"
import React from "react"

import { Text } from "./Text"

/* This is an example component test using react-native-testing-library. For more
 * information on how to write your own, see the documentation here:
 * https://callstack.github.io/react-native-testing-library/ */
const testText = "Test string"

describe("Text", () => {
  it("should render the component", () => {
    const { getByText } = render(<Text text={testText} />)
    expect(getByText(testText)).toBeDefined()
  })
})

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Button.tsx

import React, { ComponentType } from "react"
import {
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"
import { colors, spacing, typography } from "../theme"
import { Text, TextProps } from "./Text"

type Presets = keyof typeof $viewPresets

export interface ButtonAccessoryProps {
  style: StyleProp<any>
  pressableState: PressableStateCallbackType
  disabled?: boolean
}

export interface ButtonProps extends PressableProps {
  /**
   * Text which is looked up via i18n.
   */
  tx?: TextProps["tx"]
  /**
   * The text to display if not using `tx` or nested components.
   */
  text?: TextProps["text"]
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  txOptions?: TextProps["txOptions"]
  /**
   * An optional style override useful for padding & margin.
   */
  style?: StyleProp<ViewStyle>
  /**
   * An optional style override for the "pressed" state.
   */
  pressedStyle?: StyleProp<ViewStyle>
  /**
   * An optional style override for the button text.
   */
  textStyle?: StyleProp<TextStyle>
  /**
   * An optional style override for the button text when in the "pressed" state.
   */
  pressedTextStyle?: StyleProp<TextStyle>
  /**
   * An optional style override for the button text when in the "disabled" state.
   */
  disabledTextStyle?: StyleProp<TextStyle>
  /**
   * One of the different types of button presets.
   */
  preset?: Presets
  /**
   * An optional component to render on the right side of the text.
   * Example: `RightAccessory={(props) => <View {...props} />}`
   */
  RightAccessory?: ComponentType<ButtonAccessoryProps>
  /**
   * An optional component to render on the left side of the text.
   * Example: `LeftAccessory={(props) => <View {...props} />}`
   */
  LeftAccessory?: ComponentType<ButtonAccessoryProps>
  /**
   * Children components.
   */
  children?: React.ReactNode
  /**
   * disabled prop, accessed directly for declarative styling reasons.
   * https://reactnative.dev/docs/pressable#disabled
   */
  disabled?: boolean
  /**
   * An optional style override for the disabled state
   */
  disabledStyle?: StyleProp<ViewStyle>
}

/**
 * A component that allows users to take actions and make choices.
 * Wraps the Text component with a Pressable component.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Button/}
 * @param {ButtonProps} props - The props for the `Button` component.
 * @returns {JSX.Element} The rendered `Button` component.
 * @example
 * <Button
 *   tx="common.ok"
 *   style={styles.button}
 *   textStyle={styles.buttonText}
 *   onPress={handleButtonPress}
 * />
 */
export function Button(props: ButtonProps) {
  const {
    tx,
    text,
    txOptions,
    style: $viewStyleOverride,
    pressedStyle: $pressedViewStyleOverride,
    textStyle: $textStyleOverride,
    pressedTextStyle: $pressedTextStyleOverride,
    disabledTextStyle: $disabledTextStyleOverride,
    children,
    RightAccessory,
    LeftAccessory,
    disabled,
    disabledStyle: $disabledViewStyleOverride,
    ...rest
  } = props

  const preset: Presets = props.preset ?? "default"
  /**
   * @param {PressableStateCallbackType} root0 - The root object containing the pressed state.
   * @param {boolean} root0.pressed - The pressed state.
   * @returns {StyleProp<ViewStyle>} The view style based on the pressed state.
   */
  function $viewStyle({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> {
    return [
      $viewPresets[preset],
      $viewStyleOverride,
      !!pressed && [$pressedViewPresets[preset], $pressedViewStyleOverride],
      !!disabled && $disabledViewStyleOverride,
    ]
  }
  /**
   * @param {PressableStateCallbackType} root0 - The root object containing the pressed state.
   * @param {boolean} root0.pressed - The pressed state.
   * @returns {StyleProp<TextStyle>} The text style based on the pressed state.
   */
  function $textStyle({ pressed }: PressableStateCallbackType): StyleProp<TextStyle> {
    return [
      $textPresets[preset],
      $textStyleOverride,
      !!pressed && [$pressedTextPresets[preset], $pressedTextStyleOverride],
      !!disabled && $disabledTextStyleOverride,
    ]
  }

  return (
    <Pressable
      style={$viewStyle}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      disabled={disabled}
    >
      {(state) => (
        <>
          {!!LeftAccessory && (
            <LeftAccessory style={$leftAccessoryStyle} pressableState={state} disabled={disabled} />
          )}

          <Text tx={tx} text={text} txOptions={txOptions} style={$textStyle(state)}>
            {children}
          </Text>

          {!!RightAccessory && (
            <RightAccessory
              style={$rightAccessoryStyle}
              pressableState={state}
              disabled={disabled}
            />
          )}
        </>
      )}
    </Pressable>
  )
}

const $baseViewStyle: ViewStyle = {
  minHeight: 56,
  borderRadius: 4,
  justifyContent: "center",
  alignItems: "center",
  flexDirection: "row",
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.sm,
  overflow: "hidden",
}

const $baseTextStyle: TextStyle = {
  fontSize: 16,
  lineHeight: 20,
  fontFamily: typography.primary.medium,
  textAlign: "center",
  flexShrink: 1,
  flexGrow: 0,
  zIndex: 2,
}

const $rightAccessoryStyle: ViewStyle = { marginStart: spacing.xs, zIndex: 1 }
const $leftAccessoryStyle: ViewStyle = { marginEnd: spacing.xs, zIndex: 1 }

const $viewPresets = {
  default: [
    $baseViewStyle,
    {
      borderWidth: 1,
      borderColor: colors.palette.neutral400,
      backgroundColor: colors.palette.neutral100,
    },
  ] as StyleProp<ViewStyle>,

  filled: [$baseViewStyle, { backgroundColor: colors.palette.neutral300 }] as StyleProp<ViewStyle>,

  reversed: [
    $baseViewStyle,
    { backgroundColor: colors.palette.neutral800 },
  ] as StyleProp<ViewStyle>,
}

const $textPresets: Record<Presets, StyleProp<TextStyle>> = {
  default: $baseTextStyle,
  filled: $baseTextStyle,
  reversed: [$baseTextStyle, { color: colors.palette.neutral100 }],
}

const $pressedViewPresets: Record<Presets, StyleProp<ViewStyle>> = {
  default: { backgroundColor: colors.palette.neutral200 },
  filled: { backgroundColor: colors.palette.neutral400 },
  reversed: { backgroundColor: colors.palette.neutral700 },
}

const $pressedTextPresets: Record<Presets, StyleProp<TextStyle>> = {
  default: { opacity: 0.9 },
  filled: { opacity: 0.9 },
  reversed: { opacity: 0.9 },
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Toggle.tsx

import React, { ComponentType, FC, useMemo } from "react"
import {
  GestureResponderEvent,
  Image,
  ImageStyle,
  Platform,
  StyleProp,
  SwitchProps,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  ViewStyle,
} from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated"
import { colors, spacing } from "../theme"
import { iconRegistry, IconTypes } from "./Icon"
import { Text, TextProps } from "./Text"
import { isRTL } from "app/i18n"

type Variants = "checkbox" | "switch" | "radio"

interface BaseToggleProps extends Omit<TouchableOpacityProps, "style"> {
  /**
   * The variant of the toggle.
   * Options: "checkbox", "switch", "radio"
   * Default: "checkbox"
   */
  variant?: unknown
  /**
   * A style modifier for different input states.
   */
  status?: "error" | "disabled"
  /**
   * If false, input is not editable. The default value is true.
   */
  editable?: TextInputProps["editable"]
  /**
   * The value of the field. If true the component will be turned on.
   */
  value?: boolean
  /**
   * Invoked with the new value when the value changes.
   */
  onValueChange?: SwitchProps["onValueChange"]
  /**
   * Style overrides for the container
   */
  containerStyle?: StyleProp<ViewStyle>
  /**
   * Style overrides for the input wrapper
   */
  inputWrapperStyle?: StyleProp<ViewStyle>
  /**
   * Optional input wrapper style override.
   * This gives the inputs their size, shape, "off" background-color, and outer border.
   */
  inputOuterStyle?: ViewStyle
  /**
   * Optional input style override.
   * This gives the inputs their inner characteristics and "on" background-color.
   */
  inputInnerStyle?: ViewStyle
  /**
   * The position of the label relative to the action component.
   * Default: right
   */
  labelPosition?: "left" | "right"
  /**
   * The label text to display if not using `labelTx`.
   */
  label?: TextProps["text"]
  /**
   * Label text which is looked up via i18n.
   */
  labelTx?: TextProps["tx"]
  /**
   * Optional label options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  labelTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for label text.
   */
  labelStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the label Text component.
   */
  LabelTextProps?: TextProps
  /**
   * The helper text to display if not using `helperTx`.
   */
  helper?: TextProps["text"]
  /**
   * Helper text which is looked up via i18n.
   */
  helperTx?: TextProps["tx"]
  /**
   * Optional helper options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  helperTxOptions?: TextProps["txOptions"]
  /**
   * Pass any additional props directly to the helper Text component.
   */
  HelperTextProps?: TextProps
}

interface CheckboxToggleProps extends BaseToggleProps {
  variant?: "checkbox"
  /**
   * Optional style prop that affects the Image component.
   */
  inputDetailStyle?: ImageStyle
  /**
   * Checkbox-only prop that changes the icon used for the "on" state.
   */
  checkboxIcon?: IconTypes
}

interface RadioToggleProps extends BaseToggleProps {
  variant?: "radio"
  /**
   * Optional style prop that affects the dot View.
   */
  inputDetailStyle?: ViewStyle
}

interface SwitchToggleProps extends BaseToggleProps {
  variant?: "switch"
  /**
   * Switch-only prop that adds a text/icon label for on/off states.
   */
  switchAccessibilityMode?: "text" | "icon"
  /**
   * Optional style prop that affects the knob View.
   * Note: `width` and `height` rules should be points (numbers), not percentages.
   */
  inputDetailStyle?: Omit<ViewStyle, "width" | "height"> & { width?: number; height?: number }
}

export type ToggleProps = CheckboxToggleProps | RadioToggleProps | SwitchToggleProps

interface ToggleInputProps {
  on: boolean
  status: BaseToggleProps["status"]
  disabled: boolean
  outerStyle: ViewStyle
  innerStyle: ViewStyle
  detailStyle: Omit<ViewStyle & ImageStyle, "overflow">
  switchAccessibilityMode?: SwitchToggleProps["switchAccessibilityMode"]
  checkboxIcon?: CheckboxToggleProps["checkboxIcon"]
}

/**
 * Renders a boolean input.
 * This is a controlled component that requires an onValueChange callback that updates the value prop in order for the component to reflect user actions. If the value prop is not updated, the component will continue to render the supplied value prop instead of the expected result of any user actions.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Toggle/}
 * @param {ToggleProps} props - The props for the `Toggle` component.
 * @returns {JSX.Element} The rendered `Toggle` component.
 */
export function Toggle(props: ToggleProps) {
  const {
    variant = "checkbox",
    editable = true,
    status,
    value,
    onPress,
    onValueChange,
    labelPosition = "right",
    helper,
    helperTx,
    helperTxOptions,
    HelperTextProps,
    containerStyle: $containerStyleOverride,
    inputWrapperStyle: $inputWrapperStyleOverride,
    ...WrapperProps
  } = props

  const { switchAccessibilityMode } = props as SwitchToggleProps
  const { checkboxIcon } = props as CheckboxToggleProps

  const disabled = editable === false || status === "disabled" || props.disabled

  const Wrapper = useMemo(
    () => (disabled ? View : TouchableOpacity) as ComponentType<TouchableOpacityProps | ViewProps>,
    [disabled],
  )
  const ToggleInput = useMemo(() => ToggleInputs[variant] || (() => null), [variant])

  const $containerStyles = [$containerStyleOverride]
  const $inputWrapperStyles = [$inputWrapper, $inputWrapperStyleOverride]
  const $helperStyles = [
    $helper,
    status === "error" && { color: colors.error },
    HelperTextProps?.style,
  ]

  /**
   * @param {GestureResponderEvent} e - The event object.
   */
  function handlePress(e: GestureResponderEvent) {
    if (disabled) return
    onValueChange?.(!value)
    onPress?.(e)
  }

  return (
    <Wrapper
      activeOpacity={1}
      accessibilityRole={variant}
      accessibilityState={{ checked: value, disabled }}
      {...WrapperProps}
      style={$containerStyles}
      onPress={handlePress}
    >
      <View style={$inputWrapperStyles}>
        {labelPosition === "left" && <FieldLabel {...props} labelPosition={labelPosition} />}

        <ToggleInput
          on={!!value}
          disabled={!!disabled}
          status={status}
          outerStyle={props.inputOuterStyle ?? {}}
          innerStyle={props.inputInnerStyle ?? {}}
          detailStyle={props.inputDetailStyle ?? {}}
          switchAccessibilityMode={switchAccessibilityMode}
          checkboxIcon={checkboxIcon}
        />

        {labelPosition === "right" && <FieldLabel {...props} labelPosition={labelPosition} />}
      </View>

      {!!(helper || helperTx) && (
        <Text
          preset="formHelper"
          text={helper}
          tx={helperTx}
          txOptions={helperTxOptions}
          {...HelperTextProps}
          style={$helperStyles}
        />
      )}
    </Wrapper>
  )
}

const ToggleInputs: Record<Variants, FC<ToggleInputProps>> = {
  checkbox: Checkbox,
  switch: Switch,
  radio: Radio,
}

/**
 * @param {ToggleInputProps} props - The props for the `Checkbox` component.
 * @returns {JSX.Element} The rendered `Checkbox` component.
 */
function Checkbox(props: ToggleInputProps) {
  const {
    on,
    status,
    disabled,
    checkboxIcon,
    outerStyle: $outerStyleOverride,
    innerStyle: $innerStyleOverride,
    detailStyle: $detailStyleOverride,
  } = props

  const offBackgroundColor = [
    disabled && colors.palette.neutral400,
    status === "error" && colors.errorBackground,
    colors.palette.neutral200,
  ].filter(Boolean)[0]

  const outerBorderColor = [
    disabled && colors.palette.neutral400,
    status === "error" && colors.error,
    !on && colors.palette.neutral800,
    colors.palette.secondary500,
  ].filter(Boolean)[0]

  const onBackgroundColor = [
    disabled && colors.transparent,
    status === "error" && colors.errorBackground,
    colors.palette.secondary500,
  ].filter(Boolean)[0]

  const iconTintColor = [
    disabled && colors.palette.neutral600,
    status === "error" && colors.error,
    colors.palette.accent100,
  ].filter(Boolean)[0]

  return (
    <View
      style={[
        $inputOuterVariants.checkbox,
        { backgroundColor: offBackgroundColor, borderColor: outerBorderColor },
        $outerStyleOverride,
      ]}
    >
      <Animated.View
        style={[
          $checkboxInner,
          { backgroundColor: onBackgroundColor },
          $innerStyleOverride,
          useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0) }), [on]),
        ]}
      >
        <Image
          source={checkboxIcon ? iconRegistry[checkboxIcon] : iconRegistry.check}
          style={[
            $checkboxDetail,
            !!iconTintColor && { tintColor: iconTintColor },
            $detailStyleOverride,
          ]}
        />
      </Animated.View>
    </View>
  )
}

/**
 * @param {ToggleInputProps} props - The props for the `Radio` component.
 * @returns {JSX.Element} The rendered `Radio` component.
 */
function Radio(props: ToggleInputProps) {
  const {
    on,
    status,
    disabled,
    outerStyle: $outerStyleOverride,
    innerStyle: $innerStyleOverride,
    detailStyle: $detailStyleOverride,
  } = props

  const offBackgroundColor = [
    disabled && colors.palette.neutral400,
    status === "error" && colors.errorBackground,
    colors.palette.neutral200,
  ].filter(Boolean)[0]

  const outerBorderColor = [
    disabled && colors.palette.neutral400,
    status === "error" && colors.error,
    !on && colors.palette.neutral800,
    colors.palette.secondary500,
  ].filter(Boolean)[0]

  const onBackgroundColor = [
    disabled && colors.transparent,
    status === "error" && colors.errorBackground,
    colors.palette.neutral100,
  ].filter(Boolean)[0]

  const dotBackgroundColor = [
    disabled && colors.palette.neutral600,
    status === "error" && colors.error,
    colors.palette.secondary500,
  ].filter(Boolean)[0]

  return (
    <View
      style={[
        $inputOuterVariants.radio,
        { backgroundColor: offBackgroundColor, borderColor: outerBorderColor },
        $outerStyleOverride,
      ]}
    >
      <Animated.View
        style={[
          $radioInner,
          { backgroundColor: onBackgroundColor },
          $innerStyleOverride,
          useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0) }), [on]),
        ]}
      >
        <View
          style={[$radioDetail, { backgroundColor: dotBackgroundColor }, $detailStyleOverride]}
        />
      </Animated.View>
    </View>
  )
}

/**
 * @param {ToggleInputProps} props - The props for the `Switch` component.
 * @returns {JSX.Element} The rendered `Switch` component.
 */
function Switch(props: ToggleInputProps) {
  const {
    on,
    status,
    disabled,
    outerStyle: $outerStyleOverride,
    innerStyle: $innerStyleOverride,
    detailStyle: $detailStyleOverride,
  } = props

  const knobSizeFallback = 2

  const knobWidth = [$detailStyleOverride?.width, $switchDetail?.width, knobSizeFallback].find(
    (v) => typeof v === "number",
  )

  const knobHeight = [$detailStyleOverride?.height, $switchDetail?.height, knobSizeFallback].find(
    (v) => typeof v === "number",
  )

  const offBackgroundColor = [
    disabled && colors.palette.neutral400,
    status === "error" && colors.errorBackground,
    colors.palette.neutral300,
  ].filter(Boolean)[0]

  const onBackgroundColor = [
    disabled && colors.transparent,
    status === "error" && colors.errorBackground,
    colors.palette.secondary500,
  ].filter(Boolean)[0]

  const knobBackgroundColor = (function () {
    if (on) {
      return [
        $detailStyleOverride?.backgroundColor,
        status === "error" && colors.error,
        disabled && colors.palette.neutral600,
        colors.palette.neutral100,
      ].filter(Boolean)[0]
    } else {
      return [
        $innerStyleOverride?.backgroundColor,
        disabled && colors.palette.neutral600,
        status === "error" && colors.error,
        colors.palette.neutral200,
      ].filter(Boolean)[0]
    }
  })()

  const $animatedSwitchKnob = useAnimatedStyle(() => {
    const offsetLeft = ($innerStyleOverride?.paddingStart ||
      $innerStyleOverride?.paddingLeft ||
      $switchInner?.paddingStart ||
      $switchInner?.paddingLeft ||
      0) as number

    const offsetRight = ($innerStyleOverride?.paddingEnd ||
      $innerStyleOverride?.paddingRight ||
      $switchInner?.paddingEnd ||
      $switchInner?.paddingRight ||
      0) as number

    // For RTL support:
    // - web flip input range to [1,0]
    // - outputRange doesn't want rtlAdjustment
    const rtlAdjustment = isRTL ? -1 : 1
    const inputRange = Platform.OS === "web" ? (isRTL ? [1, 0] : [0, 1]) : [0, 1]
    const outputRange =
      Platform.OS === "web"
        ? [offsetLeft, +(knobWidth || 0) + offsetRight]
        : [rtlAdjustment * offsetLeft, rtlAdjustment * (+(knobWidth || 0) + offsetRight)]

    const translateX = interpolate(on ? 1 : 0, inputRange, outputRange, Extrapolation.CLAMP)

    return { transform: [{ translateX: withTiming(translateX) }] }
  }, [on, knobWidth])

  return (
    <View
      style={[
        $inputOuterVariants.switch,
        { backgroundColor: offBackgroundColor },
        $outerStyleOverride,
      ]}
    >
      <Animated.View
        style={[
          $switchInner,
          { backgroundColor: onBackgroundColor },
          $innerStyleOverride,
          useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0) }), [on]),
        ]}
      />

      <SwitchAccessibilityLabel {...props} role="on" />
      <SwitchAccessibilityLabel {...props} role="off" />

      <Animated.View
        style={[
          $switchDetail,
          $detailStyleOverride,
          $animatedSwitchKnob,
          { width: knobWidth, height: knobHeight },
          { backgroundColor: knobBackgroundColor },
        ]}
      />
    </View>
  )
}

/**
 * @param {ToggleInputProps & { role: "on" | "off" }} props - The props for the `SwitchAccessibilityLabel` component.
 * @returns {JSX.Element} The rendered `SwitchAccessibilityLabel` component.
 */
function SwitchAccessibilityLabel(props: ToggleInputProps & { role: "on" | "off" }) {
  const { on, disabled, status, switchAccessibilityMode, role, innerStyle, detailStyle } = props

  if (!switchAccessibilityMode) return null

  const shouldLabelBeVisible = (on && role === "on") || (!on && role === "off")

  const $switchAccessibilityStyle: StyleProp<ViewStyle> = [
    $switchAccessibility,
    role === "off" && { end: "5%" },
    role === "on" && { left: "5%" },
  ]

  const color = (function () {
    if (disabled) return colors.palette.neutral600
    if (status === "error") return colors.error
    if (!on) return innerStyle?.backgroundColor || colors.palette.secondary500
    return detailStyle?.backgroundColor || colors.palette.neutral100
  })()

  return (
    <View style={$switchAccessibilityStyle}>
      {switchAccessibilityMode === "text" && shouldLabelBeVisible && (
        <View
          style={[
            role === "on" && $switchAccessibilityLine,
            role === "on" && { backgroundColor: color },
            role === "off" && $switchAccessibilityCircle,
            role === "off" && { borderColor: color },
          ]}
        />
      )}

      {switchAccessibilityMode === "icon" && shouldLabelBeVisible && (
        <Image
          style={[$switchAccessibilityIcon, { tintColor: color }]}
          source={role === "off" ? iconRegistry.hidden : iconRegistry.view}
        />
      )}
    </View>
  )
}

/**
 * @param {BaseToggleProps} props - The props for the `FieldLabel` component.
 * @returns {JSX.Element} The rendered `FieldLabel` component.
 */
function FieldLabel(props: BaseToggleProps) {
  const {
    status,
    label,
    labelTx,
    labelTxOptions,
    LabelTextProps,
    labelPosition,
    labelStyle: $labelStyleOverride,
  } = props

  if (!label && !labelTx && !LabelTextProps?.children) return null

  const $labelStyle = [
    $label,
    status === "error" && { color: colors.error },
    labelPosition === "right" && $labelRight,
    labelPosition === "left" && $labelLeft,
    $labelStyleOverride,
    LabelTextProps?.style,
  ]

  return (
    <Text
      preset="formLabel"
      text={label}
      tx={labelTx}
      txOptions={labelTxOptions}
      {...LabelTextProps}
      style={$labelStyle}
    />
  )
}

const $inputWrapper: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $inputOuterBase: ViewStyle = {
  height: 24,
  width: 24,
  borderWidth: 2,
  alignItems: "center",
  overflow: "hidden",
  flexGrow: 0,
  flexShrink: 0,
  justifyContent: "space-between",
  flexDirection: "row",
}

const $inputOuterVariants: Record<Variants, StyleProp<ViewStyle>> = {
  checkbox: [$inputOuterBase, { borderRadius: 4 }],
  radio: [$inputOuterBase, { borderRadius: 12 }],
  switch: [$inputOuterBase, { height: 32, width: 56, borderRadius: 16, borderWidth: 0 }],
}

const $checkboxInner: ViewStyle = {
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
}

const $checkboxDetail: ImageStyle = {
  width: 20,
  height: 20,
  resizeMode: "contain",
}

const $radioInner: ViewStyle = {
  width: "100%",
  height: "100%",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
}

const $radioDetail: ViewStyle = {
  width: 12,
  height: 12,
  borderRadius: 6,
}

const $switchInner: ViewStyle = {
  width: "100%",
  height: "100%",
  alignItems: "center",
  borderColor: colors.transparent,
  overflow: "hidden",
  position: "absolute",
  paddingStart: 4,
  paddingEnd: 4,
}

const $switchDetail: SwitchToggleProps["inputDetailStyle"] = {
  borderRadius: 12,
  position: "absolute",
  width: 24,
  height: 24,
}

const $helper: TextStyle = {
  marginTop: spacing.xs,
}

const $label: TextStyle = {
  flex: 1,
}

const $labelRight: TextStyle = {
  marginStart: spacing.md,
}

const $labelLeft: TextStyle = {
  marginEnd: spacing.md,
}

const $switchAccessibility: TextStyle = {
  width: "40%",
  justifyContent: "center",
  alignItems: "center",
}

const $switchAccessibilityIcon: ImageStyle = {
  width: 14,
  height: 14,
  resizeMode: "contain",
}

const $switchAccessibilityLine: ViewStyle = {
  width: 2,
  height: 12,
}

const $switchAccessibilityCircle: ViewStyle = {
  borderWidth: 2,
  width: 12,
  height: 12,
  borderRadius: 6,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/Text.tsx

import i18n from "i18n-js"
import React from "react"
import { StyleProp, Text as RNText, TextProps as RNTextProps, TextStyle } from "react-native"
import { isRTL, translate, TxKeyPath } from "../i18n"
import { colors, typography } from "../theme"

type Sizes = keyof typeof $sizeStyles
type Weights = keyof typeof typography.primary
type Presets = keyof typeof $presets

export interface TextProps extends RNTextProps {
  /**
   * Text which is looked up via i18n.
   */
  tx?: TxKeyPath
  /**
   * The text to display if not using `tx` or nested components.
   */
  text?: string
  /**
   * Optional options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  txOptions?: i18n.TranslateOptions
  /**
   * An optional style override useful for padding & margin.
   */
  style?: StyleProp<TextStyle>
  /**
   * One of the different types of text presets.
   */
  preset?: Presets
  /**
   * Text weight modifier.
   */
  weight?: Weights
  /**
   * Text size modifier.
   */
  size?: Sizes
  /**
   * Children components.
   */
  children?: React.ReactNode
}

/**
 * For your text displaying needs.
 * This component is a HOC over the built-in React Native one.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/Text/}
 * @param {TextProps} props - The props for the `Text` component.
 * @returns {JSX.Element} The rendered `Text` component.
 */
export function Text(props: TextProps) {
  const { weight, size, tx, txOptions, text, children, style: $styleOverride, ...rest } = props

  const i18nText = tx && translate(tx, txOptions)
  const content = i18nText || text || children

  const preset: Presets = props.preset ?? "default"
  const $styles: StyleProp<TextStyle> = [
    $rtlStyle,
    $presets[preset],
    weight && $fontWeightStyles[weight],
    size && $sizeStyles[size],
    $styleOverride,
  ]

  return (
    <RNText {...rest} style={$styles}>
      {content}
    </RNText>
  )
}

const $sizeStyles = {
  xxl: { fontSize: 36, lineHeight: 44 } satisfies TextStyle,
  xl: { fontSize: 24, lineHeight: 34 } satisfies TextStyle,
  lg: { fontSize: 20, lineHeight: 32 } satisfies TextStyle,
  md: { fontSize: 18, lineHeight: 26 } satisfies TextStyle,
  sm: { fontSize: 16, lineHeight: 24 } satisfies TextStyle,
  xs: { fontSize: 14, lineHeight: 21 } satisfies TextStyle,
  xxs: { fontSize: 12, lineHeight: 18 } satisfies TextStyle,
}

const $fontWeightStyles = Object.entries(typography.primary).reduce((acc, [weight, fontFamily]) => {
  return { ...acc, [weight]: { fontFamily } }
}, {}) as Record<Weights, TextStyle>

const $baseStyle: StyleProp<TextStyle> = [
  $sizeStyles.sm,
  $fontWeightStyles.normal,
  { color: colors.text },
]

const $presets = {
  default: $baseStyle,

  bold: [$baseStyle, $fontWeightStyles.bold] as StyleProp<TextStyle>,

  heading: [$baseStyle, $sizeStyles.xxl, $fontWeightStyles.bold] as StyleProp<TextStyle>,

  subheading: [$baseStyle, $sizeStyles.lg, $fontWeightStyles.medium] as StyleProp<TextStyle>,

  formLabel: [$baseStyle, $fontWeightStyles.medium] as StyleProp<TextStyle>,

  formHelper: [$baseStyle, $sizeStyles.sm, $fontWeightStyles.normal] as StyleProp<TextStyle>,
}

const $rtlStyle: TextStyle = isRTL ? { writingDirection: "rtl" } : {}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/components/EmptyState.tsx

import React from "react"
import { Image, ImageProps, ImageStyle, StyleProp, TextStyle, View, ViewStyle } from "react-native"
import { translate } from "../i18n"
import { spacing } from "../theme"
import { Button, ButtonProps } from "./Button"
import { Text, TextProps } from "./Text"

const sadFace = require("../../assets/images/sad-face.png")

interface EmptyStateProps {
  /**
   * An optional prop that specifies the text/image set to use for the empty state.
   */
  preset?: keyof typeof EmptyStatePresets
  /**
   * Style override for the container.
   */
  style?: StyleProp<ViewStyle>
  /**
   * An Image source to be displayed above the heading.
   */
  imageSource?: ImageProps["source"]
  /**
   * Style overrides for image.
   */
  imageStyle?: StyleProp<ImageStyle>
  /**
   * Pass any additional props directly to the Image component.
   */
  ImageProps?: Omit<ImageProps, "source">
  /**
   * The heading text to display if not using `headingTx`.
   */
  heading?: TextProps["text"]
  /**
   * Heading text which is looked up via i18n.
   */
  headingTx?: TextProps["tx"]
  /**
   * Optional heading options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  headingTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for heading text.
   */
  headingStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the heading Text component.
   */
  HeadingTextProps?: TextProps
  /**
   * The content text to display if not using `contentTx`.
   */
  content?: TextProps["text"]
  /**
   * Content text which is looked up via i18n.
   */
  contentTx?: TextProps["tx"]
  /**
   * Optional content options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  contentTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for content text.
   */
  contentStyle?: StyleProp<TextStyle>
  /**
   * Pass any additional props directly to the content Text component.
   */
  ContentTextProps?: TextProps
  /**
   * The button text to display if not using `buttonTx`.
   */
  button?: TextProps["text"]
  /**
   * Button text which is looked up via i18n.
   */
  buttonTx?: TextProps["tx"]
  /**
   * Optional button options to pass to i18n. Useful for interpolation
   * as well as explicitly setting locale or translation fallbacks.
   */
  buttonTxOptions?: TextProps["txOptions"]
  /**
   * Style overrides for button.
   */
  buttonStyle?: ButtonProps["style"]
  /**
   * Style overrides for button text.
   */
  buttonTextStyle?: ButtonProps["textStyle"]
  /**
   * Called when the button is pressed.
   */
  buttonOnPress?: ButtonProps["onPress"]
  /**
   * Pass any additional props directly to the Button component.
   */
  ButtonProps?: ButtonProps
}

interface EmptyStatePresetItem {
  imageSource: ImageProps["source"]
  heading: TextProps["text"]
  content: TextProps["text"]
  button: TextProps["text"]
}

const EmptyStatePresets = {
  generic: {
    imageSource: sadFace,
    heading: translate("emptyStateComponent.generic.heading"),
    content: translate("emptyStateComponent.generic.content"),
    button: translate("emptyStateComponent.generic.button"),
  } as EmptyStatePresetItem,
} as const

/**
 * A component to use when there is no data to display. It can be utilized to direct the user what to do next.
 * @see [Documentation and Examples]{@link https://docs.infinite.red/ignite-cli/boilerplate/components/EmptyState/}
 * @param {EmptyStateProps} props - The props for the `EmptyState` component.
 * @returns {JSX.Element} The rendered `EmptyState` component.
 */
export function EmptyState(props: EmptyStateProps) {
  const preset = EmptyStatePresets[props.preset ?? "generic"]

  const {
    button = preset.button,
    buttonTx,
    buttonOnPress,
    buttonTxOptions,
    content = preset.content,
    contentTx,
    contentTxOptions,
    heading = preset.heading,
    headingTx,
    headingTxOptions,
    imageSource = preset.imageSource,
    style: $containerStyleOverride,
    buttonStyle: $buttonStyleOverride,
    buttonTextStyle: $buttonTextStyleOverride,
    contentStyle: $contentStyleOverride,
    headingStyle: $headingStyleOverride,
    imageStyle: $imageStyleOverride,
    ButtonProps,
    ContentTextProps,
    HeadingTextProps,
    ImageProps,
  } = props

  const isImagePresent = !!imageSource
  const isHeadingPresent = !!(heading || headingTx)
  const isContentPresent = !!(content || contentTx)
  const isButtonPresent = !!(button || buttonTx)

  const $containerStyles = [$containerStyleOverride]
  const $imageStyles = [
    $image,
    (isHeadingPresent || isContentPresent || isButtonPresent) && { marginBottom: spacing.xxxs },
    $imageStyleOverride,
    ImageProps?.style,
  ]
  const $headingStyles = [
    $heading,
    isImagePresent && { marginTop: spacing.xxxs },
    (isContentPresent || isButtonPresent) && { marginBottom: spacing.xxxs },
    $headingStyleOverride,
    HeadingTextProps?.style,
  ]
  const $contentStyles = [
    $content,
    (isImagePresent || isHeadingPresent) && { marginTop: spacing.xxxs },
    isButtonPresent && { marginBottom: spacing.xxxs },
    $contentStyleOverride,
    ContentTextProps?.style,
  ]
  const $buttonStyles = [
    (isImagePresent || isHeadingPresent || isContentPresent) && { marginTop: spacing.xl },
    $buttonStyleOverride,
    ButtonProps?.style,
  ]

  return (
    <View style={$containerStyles}>
      {isImagePresent && <Image source={imageSource} {...ImageProps} style={$imageStyles} />}

      {isHeadingPresent && (
        <Text
          preset="subheading"
          text={heading}
          tx={headingTx}
          txOptions={headingTxOptions}
          {...HeadingTextProps}
          style={$headingStyles}
        />
      )}

      {isContentPresent && (
        <Text
          text={content}
          tx={contentTx}
          txOptions={contentTxOptions}
          {...ContentTextProps}
          style={$contentStyles}
        />
      )}

      {isButtonPresent && (
        <Button
          onPress={buttonOnPress}
          text={button}
          tx={buttonTx}
          txOptions={buttonTxOptions}
          textStyle={$buttonTextStyleOverride}
          {...ButtonProps}
          style={$buttonStyles}
        />
      )}
    </View>
  )
}

const $image: ImageStyle = { alignSelf: "center" }
const $heading: TextStyle = { textAlign: "center", paddingHorizontal: spacing.lg }
const $content: TextStyle = { textAlign: "center", paddingHorizontal: spacing.lg }

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/theme/colors.ts

// TODO: write documentation for colors and palette in own markdown file and add links from here

const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",

  primary100: "#F4E0D9",
  primary200: "#E8C1B4",
  primary300: "#DDA28E",
  primary400: "#D28468",
  primary500: "#C76542",
  primary600: "#A54F31",

  secondary100: "#DCDDE9",
  secondary200: "#BCC0D6",
  secondary300: "#9196B9",
  secondary400: "#626894",
  secondary500: "#41476E",

  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

  angry100: "#F2D6CD",
  angry500: "#C03403",

  overlay20: "rgba(25, 16, 21, 0.2)",
  overlay50: "rgba(25, 16, 21, 0.5)",
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  /**
   * A helper for making something see-thru.
   */
  transparent: "rgba(0, 0, 0, 0)",
  /**
   * The default text color in many components.
   */
  text: palette.neutral800,
  /**
   * Secondary text information.
   */
  textDim: palette.neutral600,
  /**
   * The default color of the screen background.
   */
  background: palette.neutral200,
  /**
   * The default border color.
   */
  border: palette.neutral400,
  /**
   * The main tinting color.
   */
  tint: palette.primary500,
  /**
   * A subtle color used for lines.
   */
  separator: palette.neutral300,
  /**
   * Error messages.
   */
  error: palette.angry500,
  /**
   * Error Background.
   *
   */
  errorBackground: palette.angry100,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/theme/timing.ts

export const timing = {
  /**
   * The duration (ms) for quick animations.
   */
  quick: 300,
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/theme/index.ts

export * from "./colors"
export * from "./spacing"
export * from "./typography"
export * from "./timing"

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/theme/typography.ts

// TODO: write documentation about fonts and typography along with guides on how to add custom fonts in own
// markdown file and add links from here

import { Platform } from "react-native"
import {
  SpaceGrotesk_300Light as spaceGroteskLight,
  SpaceGrotesk_400Regular as spaceGroteskRegular,
  SpaceGrotesk_500Medium as spaceGroteskMedium,
  SpaceGrotesk_600SemiBold as spaceGroteskSemiBold,
  SpaceGrotesk_700Bold as spaceGroteskBold,
} from "@expo-google-fonts/space-grotesk"

export const customFontsToLoad = {
  spaceGroteskLight,
  spaceGroteskRegular,
  spaceGroteskMedium,
  spaceGroteskSemiBold,
  spaceGroteskBold,
}

const fonts = {
  spaceGrotesk: {
    // Cross-platform Google font.
    light: "spaceGroteskLight",
    normal: "spaceGroteskRegular",
    medium: "spaceGroteskMedium",
    semiBold: "spaceGroteskSemiBold",
    bold: "spaceGroteskBold",
  },
  helveticaNeue: {
    // iOS only font.
    thin: "HelveticaNeue-Thin",
    light: "HelveticaNeue-Light",
    normal: "Helvetica Neue",
    medium: "HelveticaNeue-Medium",
  },
  courier: {
    // iOS only font.
    normal: "Courier",
  },
  sansSerif: {
    // Android only font.
    thin: "sans-serif-thin",
    light: "sans-serif-light",
    normal: "sans-serif",
    medium: "sans-serif-medium",
  },
  monospace: {
    // Android only font.
    normal: "monospace",
  },
}

export const typography = {
  /**
   * The fonts are available to use, but prefer using the semantic name.
   */
  fonts,
  /**
   * The primary font. Used in most places.
   */
  primary: fonts.spaceGrotesk,
  /**
   * An alternate font used for perhaps titles and stuff.
   */
  secondary: Platform.select({ ios: fonts.helveticaNeue, android: fonts.sansSerif }),
  /**
   * Lets get fancy with a monospace font!
   */
  code: Platform.select({ ios: fonts.courier, android: fonts.monospace }),
}

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/theme/spacing.ts

/**
  Use these spacings for margins/paddings and other whitespace throughout your app.
 */
export const spacing = {
  xxxs: 2,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const

export type Spacing = keyof typeof spacing

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/devtools/ReactotronClient.ts

/**
 * This file is loaded in React Native and exports the RN version
 * of Reactotron's client.
 *
 * Web is loaded from ReactotronClient.web.ts.
 */
import Reactotron from "reactotron-react-native"
export { Reactotron }

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/devtools/ReactotronConfig.ts

/**
 * This file does the setup for integration with Reactotron, which is a
 * free desktop app for inspecting and debugging your React Native app.
 * @see https://github.com/infinitered/reactotron
 */
import { Platform, NativeModules } from "react-native"

import AsyncStorage from "@react-native-async-storage/async-storage"
import { ArgType } from "reactotron-core-client"
import { mst } from "reactotron-mst"

import { clear } from "app/utils/storage"
import { goBack, resetRoot, navigate } from "app/navigators/navigationUtilities"

import { Reactotron } from "./ReactotronClient"

const reactotron = Reactotron.configure({
  name: require("../../package.json").name,
  onConnect: () => {
    /** since this file gets hot reloaded, let's clear the past logs every time we connect */
    Reactotron.clear()
  },
}).use(
  mst({
    /* ignore some chatty `mobx-state-tree` actions */
    filter: (event) => /postProcessSnapshot|@APPLY_SNAPSHOT/.test(event.name) === false,
  }),
)

if (Platform.OS !== "web") {
  reactotron.setAsyncStorageHandler?.(AsyncStorage)
  reactotron.useReactNative({
    networking: {
      ignoreUrls: /symbolicate/,
    },
  })
}

/**
 * Reactotron allows you to define custom commands that you can run
 * from Reactotron itself, and they will run in your app.
 *
 * Define them in the section below with `onCustomCommand`. Use your
 * creativity -- this is great for development to quickly and easily
 * get your app into the state you want.
 *
 * NOTE: If you edit this file while running the app, you will need to do a full refresh
 * or else your custom commands won't be registered correctly.
 */
reactotron.onCustomCommand({
  title: "Show Dev Menu",
  description: "Opens the React Native dev menu",
  command: "showDevMenu",
  handler: () => {
    Reactotron.log("Showing React Native dev menu")
    NativeModules.DevMenu.show()
  },
})

reactotron.onCustomCommand({
  title: "Reset Root Store",
  description: "Resets the MST store",
  command: "resetStore",
  handler: () => {
    Reactotron.log("resetting store")
    clear()
  },
})

reactotron.onCustomCommand({
  title: "Reset Navigation State",
  description: "Resets the navigation state",
  command: "resetNavigation",
  handler: () => {
    Reactotron.log("resetting navigation state")
    resetRoot({ index: 0, routes: [] })
  },
})

reactotron.onCustomCommand<[{ name: "route"; type: ArgType.String }]>({
  command: "navigateTo",
  handler: (args) => {
    const { route } = args ?? {}
    if (route) {
      Reactotron.log(`Navigating to: ${route}`)
      navigate(route as any) // this should be tied to the navigator, but since this is for debugging, we can navigate to illegal routes
    } else {
      Reactotron.log("Could not navigate. No route provided.")
    }
  },
  title: "Navigate To Screen",
  description: "Navigates to a screen by name.",
  args: [{ name: "route", type: ArgType.String }],
})

reactotron.onCustomCommand({
  title: "Go Back",
  description: "Goes back",
  command: "goBack",
  handler: () => {
    Reactotron.log("Going back")
    goBack()
  },
})

/**
 * We're going to add `console.tron` to the Reactotron object.
 * Now, anywhere in our app in development, we can use Reactotron like so:
 *
 * ```
 * if (__DEV__) {
 *  console.tron.display({
 *    name: 'JOKE',
 *    preview: 'What's the best thing about Switzerland?',
 *    value: 'I don't know, but the flag is a big plus!',
 *    important: true
 *  })
 * }
 * ```
 *
 * Use this power responsibly! :)
 */
console.tron = reactotron

/**
 * We tell typescript about our dark magic
 *
 * You can also import Reactotron yourself from ./reactotronClient
 * and use it directly, like Reactotron.log('hello world')
 */
declare global {
  interface Console {
    /**
     * Reactotron client for logging, displaying, measuring performance, and more.
     * @see https://github.com/infinitered/reactotron
     * @example
     * if (__DEV__) {
     *  console.tron.display({
     *    name: 'JOKE',
     *    preview: 'What's the best thing about Switzerland?',
     *    value: 'I don't know, but the flag is a big plus!',
     *    important: true
     *  })
     * }
     */
    tron: typeof reactotron
  }
}

/**
 * Now that we've setup all our Reactotron configuration, let's connect!
 */
reactotron.connect()

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/devtools/ReactotronClient.web.ts

/**
 * This file is loaded in web and exports the React.js version
 * of Reactotron's client.
 *
 * React Native is loaded from ReactotronClient.ts.
 *
 * If your project does not need web support, you can delete this file and
 * remove reactotron-react-js from your package.json dependencies.
 */
import Reactotron from "reactotron-react-js"
export { Reactotron }

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/ar.ts

import demoAr from "./demo-ar"
import { Translations } from "./en"

const ar: Translations = {
  common: {
    ok: "نعم",
    cancel: "حذف",
    back: "خلف",
    logOut: "تسجيل خروج", // @demo remove-current-line
  },
  welcomeScreen: {
    postscript:
      "ربما لا يكون هذا هو الشكل الذي يبدو عليه تطبيقك مالم يمنحك المصمم هذه الشاشات وشحنها في هذه الحالة",
    readyForLaunch: "تطبيقك تقريبا جاهز للتشغيل",
    exciting: "اوه هذا مثير",
    letsGo: "لنذهب", // @demo remove-current-line
  },
  errorScreen: {
    title: "هناك خطأ ما",
    friendlySubtitle:
      "هذه هي الشاشة التي سيشاهدها المستخدمون في عملية الانتاج عند حدوث خطأ. سترغب في تخصيص هذه الرسالة ( الموجودة في 'ts.en/i18n/app') وربما التخطيط ايضاً ('app/screens/ErrorScreen'). إذا كنت تريد إزالة هذا بالكامل، تحقق من 'app/app.tsp' من اجل عنصر <ErrorBoundary>.",
    reset: "اعادة تعيين التطبيق",
    traceTitle: "خطأ من مجموعة %{name}", // @demo remove-current-line
  },
  emptyStateComponent: {
    generic: {
      heading: "فارغة جداً....حزين",
      content: "لا توجد بيانات حتى الآن. حاول النقر فوق الزر لتحديث التطبيق او اعادة تحميله.",
      button: "لنحاول هذا مرّة أخرى",
    },
  },
  // @demo remove-block-start
  errors: {
    invalidEmail: "عنوان البريد الالكتروني غير صالح",
  },
  loginScreen: {
    logIn: "تسجيل الدخول",
    enterDetails:
      ".ادخل التفاصيل الخاصة بك ادناه لفتح معلومات سرية للغاية. لن تخمن ابداً ما الذي ننتظره. او ربما ستفعل انها انها ليست علم الصواريخ",
    emailFieldLabel: "البريد الالكتروني",
    passwordFieldLabel: "كلمة السر",
    emailFieldPlaceholder: "ادخل بريدك الالكتروني",
    passwordFieldPlaceholder: "كلمة السر هنا فائقة السر",
    tapToLogIn: "انقر لتسجيل الدخول!",
    hint: "(: تلميح: يمكنك استخدام اي عنوان بريد الكتروني وكلمة السر المفضلة لديك",
  },
  demoNavigator: {
    componentsTab: "عناصر",
    debugTab: "تصحيح",
    communityTab: "واصل اجتماعي",
    podcastListTab: "البودكاست",
  },
  demoCommunityScreen: {
    title: "تواصل مع المجتمع",
    tagLine:
      "قم بالتوصيل لمنتدى Infinite Red الذي يضم تفاعل المهندسين المحلّيين ورفع مستوى تطوير تطبيقك معنا",
    joinUsOnSlackTitle: "انضم الينا على Slack",
    joinUsOnSlack:
      "هل ترغب في وجود مكان للتواصل مع مهندسي React Native حول العالم؟ الانضمام الى المحادثة في سلاك المجتمع الاحمر اللانهائي! مجتمعناالمتنامي هو مساحةآمنة لطرح الاسئلة والتعلم من الآخرين وتنمية شبكتك.",
    joinSlackLink: "انضم الي مجتمع Slack",
    makeIgniteEvenBetterTitle: "اجعل Ignite افضل",
    makeIgniteEvenBetter:
      "هل لديك فكرة لجعل Ignite افضل؟ نحن سعداء لسماع ذلك! نحن نبحث دائماً عن الآخرين الذين يرغبون في مساعدتنا في بناء افضل الادوات المحلية التفاعلية المتوفرة هناك. انضم الينا عبر GitHub للانضمام الينا في بناء مستقبل Ignite",
    contributeToIgniteLink: "ساهم في Ignite",
    theLatestInReactNativeTitle: "الاحدث في React Native",
    theLatestInReactNative: "نخن هنا لنبقيك محدثاً على جميع React Native التي تعرضها",
    reactNativeRadioLink: "راديو React Native",
    reactNativeNewsletterLink: "نشرة اخبار React Native",
    reactNativeLiveLink: "مباشر React Native",
    chainReactConferenceLink: "مؤتمر Chain React",
    hireUsTitle: "قم بتوظيف Infinite Red لمشروعك القادم",
    hireUs:
      "سواء كان الامر يتعلّق بتشغيل مشروع كامل او اعداد الفرق بسرعة من خلال التدريب العلمي لدينا، يمكن ان يساعد Infinite Red اللامتناهي في اي مشروع محلي يتفاعل معه.",
    hireUsLink: "ارسل لنا رسالة",
  },
  demoShowroomScreen: {
    jumpStart: "مكونات او عناصر لبدء مشروعك",
    lorem2Sentences:
      "عامل الناس بأخلاقك لا بأخلاقهم. عامل الناس بأخلاقك لا بأخلاقهم. عامل الناس بأخلاقك لا بأخلاقهم",
    demoHeaderTxExample: "ياي",
    demoViaTxProp: "عبر `tx` Prop",
    demoViaSpecifiedTxProp: "Prop `{{prop}}Tx` عبر",
  },
  demoDebugScreen: {
    howTo: "كيف",
    title: "التصحيح",
    tagLine: "مبروك، لديك نموذج اصلي متقدم للغاية للتفاعل هنا. الاستفادة من هذه النمذجة",
    reactotron: "Reactotron ارسل إلى",
    reportBugs: "الابلاغ عن اخطاء",
    demoList: "قائمة تجريبية",
    demoPodcastList: "قائمة البودكاست التجريبي",
    androidReactotronHint:
      "اذا لم ينجح ذللك، فتأكد من تشغيل تطبيق الحاسوب الخاص Reactotron، وقم بتشغيل عكس adb tcp:9090 \ntcp:9090 من جهازك الطرفي ، واعد تحميل التطبيق",
    iosReactotronHint:
      "اذا لم ينجح ذلك، فتأكد من تشغيل تطبيق الحاسوب الخاص ب Reactotron وأعد تحميل التطبيق",
    macosReactotronHint: "اذا لم ينجح ذلك، فتأكد من تشغيل الحاسوب ب Reactotron وأعد تحميل التطبيق",
    webReactotronHint: "اذا لم ينجح ذلك، فتأكد من تشغيل الحاسوب ب Reactotron وأعد تحميل التطبيق",
    windowsReactotronHint:
      "اذا لم ينجح ذلك، فتأكد من تشغيل الحاسوب ب Reactotron وأعد تحميل التطبيق",
  },
  demoPodcastListScreen: {
    title: "حلقات إذاعية React Native",
    onlyFavorites: "المفضلة فقط",
    favoriteButton: "المفضل",
    unfavoriteButton: "غير مفضل",
    accessibility: {
      cardHint: "انقر مرّتين للاستماع على الحلقة. انقر مرّتين وانتظر لتفعيل {{action}} هذه الحلقة.",
      switch: "قم بالتبديل لاظهار المفضّلة فقط.",
      favoriteAction: "تبديل المفضلة",
      favoriteIcon: "الحلقة الغير مفضّلة",
      unfavoriteIcon: "الحلقة المفضّلة",
      publishLabel: "نشرت {{date}}",
      durationLabel: "المدّة: {{hours}} ساعات {{minutes}} دقائق {{seconds}} ثواني",
    },
    noFavoritesEmptyState: {
      heading: "هذا يبدو فارغاً بعض الشيء.",
      content:
        "لم تتم اضافة اي مفضلات حتى الان. اضغط على القلب في إحدى الحلقات لإضافته الى المفضلة.",
    },
  },
  // @demo remove-block-start
  ...demoAr,
  // @demo remove-block-end
}

export default ar

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/i18n.ts

import * as Localization from "expo-localization"
import { I18n } from "i18n-js"
import { I18nManager } from "react-native"

// if English isn't your default language, move Translations to the appropriate language file.
import en, { Translations } from "./en"
import ar from "./ar"
import ko from "./ko"
import fr from "./fr"
import jp from "./jp"

// Migration guide from i18n 3.x -> 4.x:
// https://github.com/fnando/i18n-js/blob/main/MIGRATING_FROM_V3_TO_V4.md
// https://github.com/fnando/i18n/discussions/24

// to use regional locales use { "en-US": enUS } etc
const fallbackLocale = "en-US"
export const i18n = new I18n(
  { ar, en, "en-US": en, ko, fr, jp },
  { locale: fallbackLocale, defaultLocale: fallbackLocale, enableFallback: true },
)

const systemLocale = Localization.getLocales()[0]
const systemLocaleTag = systemLocale?.languageTag ?? fallbackLocale

if (Object.prototype.hasOwnProperty.call(i18n.translations, systemLocaleTag)) {
  // if specific locales like en-FI or en-US is available, set it
  i18n.locale = systemLocaleTag
} else {
  // otherwise try to fallback to the general locale (dropping the -XX suffix)
  const generalLocale = systemLocaleTag.split("-")[0]
  if (Object.prototype.hasOwnProperty.call(i18n.translations, generalLocale)) {
    i18n.locale = generalLocale
  } else {
    i18n.locale = fallbackLocale
  }
}

// handle RTL languages
export const isRTL = systemLocale?.textDirection === "rtl"
I18nManager.allowRTL(isRTL)
I18nManager.forceRTL(isRTL)

/**
 * Builds up valid keypaths for translations.
 */
export type TxKeyPath = RecursiveKeyOf<Translations>

// via: https://stackoverflow.com/a/65333050
type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<TObj[TKey], `${TKey}`>
}[keyof TObj & (string | number)]

type RecursiveKeyOfInner<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: RecursiveKeyOfHandleValue<
    TObj[TKey],
    `['${TKey}']` | `.${TKey}`
  >
}[keyof TObj & (string | number)]

type RecursiveKeyOfHandleValue<TValue, Text extends string> = TValue extends any[]
  ? Text
  : TValue extends object
  ? Text | `${Text}${RecursiveKeyOfInner<TValue>}`
  : Text

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/jp.ts

import demoJp from "./demo-jp"
import { Translations } from "./en"

const jp: Translations = {
  common: {
    ok: "OK",
    cancel: "キャンセル",
    back: "戻る",
    logOut: "ログアウト", // @demo remove-current-line
  },
  welcomeScreen: {
    postscript:
      "注目！ — このアプリはお好みの見た目では無いかもしれません(デザイナーがこのスクリーンを送ってこない限りは。もしそうなら公開しちゃいましょう！)",
    readyForLaunch: "このアプリはもう少しで公開できます！",
    exciting: "(楽しみですね！)",
    letsGo: "レッツゴー！", // @demo remove-current-line
  },
  errorScreen: {
    title: "問題が発生しました",
    friendlySubtitle:
      "本番では、エラーが投げられた時にこのページが表示されます。もし使うならこのメッセージに変更を加えてください(`app/i18n/jp.ts`)レイアウトはこちらで変更できます(`app/screens/ErrorScreen`)。もしこのスクリーンを取り除きたい場合は、`app/app.tsx`にある<ErrorBoundary>コンポーネントをチェックしてください",
    reset: "リセット",
    traceTitle: "エラーのスタック: %{name}", // @demo remove-current-line
  },
  emptyStateComponent: {
    generic: {
      heading: "静かだ...悲しい。",
      content:
        "データが見つかりません。ボタンを押してアプリをリロード、またはリフレッシュしてください。",
      button: "もう一度やってみよう",
    },
  },
  // @demo remove-block-start
  errors: {
    invalidEmail: "有効なメールアドレスを入力してください.",
  },
  loginScreen: {
    logIn: "ログイン",
    enterDetails:
      "ここにあなたの情報を入力してトップシークレットをアンロックしましょう。何が待ち構えているか予想もつかないはずです。はたまたそうでも無いかも - ロケットサイエンスほど複雑なものではありません。",
    emailFieldLabel: "メールアドレス",
    passwordFieldLabel: "パスワード",
    emailFieldPlaceholder: "メールアドレスを入力してください",
    passwordFieldPlaceholder: "パスワードを入力してください",
    tapToLogIn: "タップしてログインしよう！",
    hint: "ヒント: お好みのメールアドレスとパスワードを使ってください :)",
  },
  demoNavigator: {
    componentsTab: "コンポーネント",
    debugTab: "デバッグ",
    communityTab: "コミュニティ",
    podcastListTab: "ポッドキャスト",
  },
  demoCommunityScreen: {
    title: "コミュニティと繋がろう",
    tagLine:
      "Infinite RedのReact Nativeエンジニアコミュニティに接続して、一緒にあなたのアプリ開発をレベルアップしましょう！",
    joinUsOnSlackTitle: "私たちのSlackに参加しましょう",
    joinUsOnSlack:
      "世界中のReact Nativeエンジニアと繋がりたいを思いませんか？Infinite RedのコミュニティSlackに参加しましょう！私達のコミュニティは安全に質問ができ、お互いから学び、あなたのネットワークを広げることができます。",
    joinSlackLink: "Slackコミュニティに参加する",
    makeIgniteEvenBetterTitle: "Igniteをより良くする",
    makeIgniteEvenBetter:
      "Igniteをより良くする為のアイデアはありますか? そうであれば聞きたいです！ 私たちはいつでも最良のReact Nativeのツールを開発する為に助けを求めています。GitHubで私たちと一緒にIgniteの未来を作りましょう。",
    contributeToIgniteLink: "Igniteにコントリビュートする",
    theLatestInReactNativeTitle: "React Nativeの今",
    theLatestInReactNative: "React Nativeの現在をあなたにお届けします。",
    reactNativeRadioLink: "React Native Radio",
    reactNativeNewsletterLink: "React Native Newsletter",
    reactNativeLiveLink: "React Native Live",
    chainReactConferenceLink: "Chain React Conference",
    hireUsTitle: "あなたの次のプロジェクトでInfinite Redと契約する",
    hireUs:
      "それがプロジェクト全体でも、チームにトレーニングをしてあげたい時でも、Infinite RedはReact Nativeのことであればなんでもお手伝いができます。",
    hireUsLink: "メッセージを送る",
  },
  demoShowroomScreen: {
    jumpStart: "あなたのプロジェクトをスタートさせるコンポーネントです！",
    lorem2Sentences:
      "Nulla cupidatat deserunt amet quis aliquip nostrud do adipisicing. Adipisicing excepteur elit laborum Lorem adipisicing do duis.",
    demoHeaderTxExample: "Yay",
    demoViaTxProp: "`tx`から",
    demoViaSpecifiedTxProp: "`{{prop}}Tx`から",
  },
  demoDebugScreen: {
    howTo: "ハウツー",
    title: "デバッグ",
    tagLine:
      "おめでとうございます、あなたはとてもハイレベルなReact Nativeのテンプレートを使ってます。このボイラープレートを活用してください！",
    reactotron: "Reactotronに送る",
    reportBugs: "バグをレポートする",
    demoList: "デモリスト",
    demoPodcastList: "デモのポッドキャストリスト",
    androidReactotronHint:
      "もし動かなければ、Reactotronのデスクトップアプリが実行されていることを確認して, このコマンドをターミナルで実行した後、アプリをアプリをリロードしてください。 adb reverse tcp:9090 tcp:9090",
    iosReactotronHint:
      "もし動かなければ、Reactotronのデスクトップアプリが実行されていることを確認して、アプリをリロードしてください。",
    macosReactotronHint:
      "もし動かなければ、Reactotronのデスクトップアプリが実行されていることを確認して、アプリをリロードしてください。",
    webReactotronHint:
      "もし動かなければ、Reactotronのデスクトップアプリが実行されていることを確認して、アプリをリロードしてください。",
    windowsReactotronHint:
      "もし動かなければ、Reactotronのデスクトップアプリが実行されていることを確認して、アプリをリロードしてください。",
  },
  demoPodcastListScreen: {
    title: "React Native Radioのエピソード",
    onlyFavorites: "お気に入り表示",
    favoriteButton: "お気に入り",
    unfavoriteButton: "お気に入りを外す",
    accessibility: {
      cardHint: "ダブルタップで再生します。 ダブルタップと長押しで {{action}}",
      switch: "スイッチオンでお気に入りを表示する",
      favoriteAction: "お気に入りの切り替え",
      favoriteIcon: "お気に入りのエピソードではありません",
      unfavoriteIcon: "お気に入りのエピソードです",
      publishLabel: "公開日 {{date}}",
      durationLabel: "再生時間: {{hours}} 時間 {{minutes}} 分 {{seconds}} 秒",
    },
    noFavoritesEmptyState: {
      heading: "どうやら空っぽのようですね",
      content:
        "お気に入りのエピソードがまだありません。エピソードにあるハートマークにタップして、お気に入りに追加しましょう！",
    },
  },
  // @demo remove-block-start
  ...demoJp,
  // @demo remove-block-end
}

export default jp

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/en.ts

import demoEn from "./demo-en"

const en = {
  common: {
    ok: "OK!",
    cancel: "Cancel",
    back: "Back",
    logOut: "Log Out", // @demo remove-current-line
  },
  welcomeScreen: {
    postscript:
      "psst  — This probably isn't what your app looks like. (Unless your designer handed you these screens, and in that case, ship it!)",
    readyForLaunch: "Your app, almost ready for launch!",
    exciting: "(ohh, this is exciting!)",
    letsGo: "Let's go!", // @demo remove-current-line
  },
  errorScreen: {
    title: "Something went wrong!",
    friendlySubtitle:
      "This is the screen that your users will see in production when an error is thrown. You'll want to customize this message (located in `app/i18n/en.ts`) and probably the layout as well (`app/screens/ErrorScreen`). If you want to remove this entirely, check `app/app.tsx` for the <ErrorBoundary> component.",
    reset: "RESET APP",
    traceTitle: "Error from %{name} stack", // @demo remove-current-line
  },
  emptyStateComponent: {
    generic: {
      heading: "So empty... so sad",
      content: "No data found yet. Try clicking the button to refresh or reload the app.",
      button: "Let's try this again",
    },
  },
  // @demo remove-block-start
  errors: {
    invalidEmail: "Invalid email address.",
  },
  loginScreen: {
    logIn: "Log In",
    enterDetails:
      "Enter your details below to unlock top secret info. You'll never guess what we've got waiting. Or maybe you will; it's not rocket science here.",
    emailFieldLabel: "Email",
    passwordFieldLabel: "Password",
    emailFieldPlaceholder: "Enter your email address",
    passwordFieldPlaceholder: "Super secret password here",
    tapToLogIn: "Tap to log in!",
    hint: "Hint: you can use any email address and your favorite password :)",
  },
  demoNavigator: {
    componentsTab: "Components",
    debugTab: "Debug",
    communityTab: "Community",
    podcastListTab: "Podcast",
  },
  demoCommunityScreen: {
    title: "Connect with the community",
    tagLine:
      "Plug in to Infinite Red's community of React Native engineers and level up your app development with us!",
    joinUsOnSlackTitle: "Join us on Slack",
    joinUsOnSlack:
      "Wish there was a place to connect with React Native engineers around the world? Join the conversation in the Infinite Red Community Slack! Our growing community is a safe space to ask questions, learn from others, and grow your network.",
    joinSlackLink: "Join the Slack Community",
    makeIgniteEvenBetterTitle: "Make Ignite even better",
    makeIgniteEvenBetter:
      "Have an idea to make Ignite even better? We're happy to hear that! We're always looking for others who want to help us build the best React Native tooling out there. Join us over on GitHub to join us in building the future of Ignite.",
    contributeToIgniteLink: "Contribute to Ignite",
    theLatestInReactNativeTitle: "The latest in React Native",
    theLatestInReactNative: "We're here to keep you current on all React Native has to offer.",
    reactNativeRadioLink: "React Native Radio",
    reactNativeNewsletterLink: "React Native Newsletter",
    reactNativeLiveLink: "React Native Live",
    chainReactConferenceLink: "Chain React Conference",
    hireUsTitle: "Hire Infinite Red for your next project",
    hireUs:
      "Whether it's running a full project or getting teams up to speed with our hands-on training, Infinite Red can help with just about any React Native project.",
    hireUsLink: "Send us a message",
  },
  demoShowroomScreen: {
    jumpStart: "Components to jump start your project!",
    lorem2Sentences:
      "Nulla cupidatat deserunt amet quis aliquip nostrud do adipisicing. Adipisicing excepteur elit laborum Lorem adipisicing do duis.",
    demoHeaderTxExample: "Yay",
    demoViaTxProp: "Via `tx` Prop",
    demoViaSpecifiedTxProp: "Via `{{prop}}Tx` Prop",
  },
  demoDebugScreen: {
    howTo: "HOW TO",
    title: "Debug",
    tagLine:
      "Congratulations, you've got a very advanced React Native app template here.  Take advantage of this boilerplate!",
    reactotron: "Send to Reactotron",
    reportBugs: "Report Bugs",
    demoList: "Demo List",
    demoPodcastList: "Demo Podcast List",
    androidReactotronHint:
      "If this doesn't work, ensure the Reactotron desktop app is running, run adb reverse tcp:9090 tcp:9090 from your terminal, and reload the app.",
    iosReactotronHint:
      "If this doesn't work, ensure the Reactotron desktop app is running and reload app.",
    macosReactotronHint:
      "If this doesn't work, ensure the Reactotron desktop app is running and reload app.",
    webReactotronHint:
      "If this doesn't work, ensure the Reactotron desktop app is running and reload app.",
    windowsReactotronHint:
      "If this doesn't work, ensure the Reactotron desktop app is running and reload app.",
  },
  demoPodcastListScreen: {
    title: "React Native Radio episodes",
    onlyFavorites: "Only Show Favorites",
    favoriteButton: "Favorite",
    unfavoriteButton: "Unfavorite",
    accessibility: {
      cardHint:
        "Double tap to listen to the episode. Double tap and hold to {{action}} this episode.",
      switch: "Switch on to only show favorites",
      favoriteAction: "Toggle Favorite",
      favoriteIcon: "Episode not favorited",
      unfavoriteIcon: "Episode favorited",
      publishLabel: "Published {{date}}",
      durationLabel: "Duration: {{hours}} hours {{minutes}} minutes {{seconds}} seconds",
    },
    noFavoritesEmptyState: {
      heading: "This looks a bit empty",
      content:
        "No favorites have been added yet. Tap the heart on an episode to add it to your favorites!",
    },
  },
  // @demo remove-block-start
  ...demoEn,
  // @demo remove-block-end
}

export default en
export type Translations = typeof en

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/demo-ko.ts

import { DemoTranslations } from "./demo-en"

export const demoKo: DemoTranslations = {
  demoIcon: {
    description:
      "등록된 아이콘을 렌더링하는 컴포넌트입니다. `onPress`가 구현되어 있으면 <TouchableOpacity />로, 그렇지 않으면 <View />로 감쌉니다.",
    useCase: {
      icons: {
        name: "아이콘",
        description: "컴포넌트에 등록된 아이콘 목록입니다.",
      },
      size: {
        name: "크기",
        description: "크기 속성이 있습니다.",
      },
      color: {
        name: "색상",
        description: "색상 속성이 있습니다.",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
      },
    },
  },
  demoTextField: {
    description: "TextField 컴포넌트는 텍스트 입력 및 편집을 허용합니다.",
    useCase: {
      statuses: {
        name: "상태",
        description:
          "다른 컴포넌트의 `preset`과 유사한 상태 속성이 있으며, 컴포넌트의 기능에도 영향을 미칩니다.",
        noStatus: {
          label: "상태 없음",
          helper: "이것이 기본 상태입니다",
          placeholder: "텍스트가 여기에 들어갑니다",
        },
        error: {
          label: "오류 상태",
          helper: "오류가 있을 때 사용하는 상태입니다",
          placeholder: "텍스트가 여기에 들어갑니다",
        },
        disabled: {
          label: "비활성 상태",
          helper: "편집 기능을 비활성화하고 텍스트를 표시하지 않습니다",
          placeholder: "텍스트가 여기에 들어갑니다",
        },
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        viaLabel: {
          labelTx: "`label` 속성으로",
          helper: "`helper` 속성으로",
          placeholder: "`placeholder` 속성으로",
        },
        rightAccessory: {
          label: "오른쪽 액세서리",
          helper: "이 속성은 React 요소를 반환하는 함수를 받습니다.",
        },
        leftAccessory: {
          label: "왼쪽 액세서리",
          helper: "이 속성은 React 요소를 반환하는 함수를 받습니다.",
        },
        supportsMultiline: {
          label: "멀티라인 지원",
          helper: "멀티라인 텍스트를 위한 더 높은 입력을 활성화합니다.",
        },
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        styleInput: {
          label: "입력 스타일",
          helper: "`style` 속성으로",
        },
        styleInputWrapper: {
          label: "입력 래퍼 스타일",
          helper: "`inputWrapperStyle` 속성으로",
        },
        styleContainer: {
          label: "컨테이너 스타일",
          helper: "`containerStyle` 속성으로",
        },
        styleLabel: {
          label: "레이블 및 헬퍼 스타일",
          helper: "`LabelTextProps` 및 `HelperTextProps` 스타일 속성으로",
        },
        styleAccessories: {
          label: "액세서리 스타일",
          helper: "`RightAccessory` 및 `LeftAccessory` 스타일 속성으로",
        },
      },
    },
  },
  demoToggle: {
    description:
      "불리언 입력을 렌더링합니다. 사용자가 수행한 작업을 반영하기 위해 값 속성을 업데이트하는 onValueChange 콜백이 필요한 제어된 컴포넌트입니다. 값 속성이 업데이트되지 않으면, 컴포넌트는 사용자 작업의 예상 결과 대신 제공된 값 속성을 계속 렌더링합니다.",
    useCase: {
      variants: {
        name: "변형",
        description:
          "이 컴포넌트는 몇 가지 변형을 지원합니다. 특정 변형을 대폭 커스터마이즈해야 하는 경우에는 쉽게 리팩토링할 수 있습니다. 기본값은 `체크박스`입니다.",
        checkbox: {
          label: "`체크박스` 변형",
          helper: "단일 켜기/끄기 입력에 사용할 수 있습니다.",
        },
        radio: {
          label: "`라디오` 변형",
          helper: "여러 옵션이 있는 경우 사용하십시오.",
        },
        switch: {
          label: "`스위치` 변형",
          helper: "더 눈에 띄는 켜기/끄기 입력입니다. 접근성 지원이 더 좋습니다.",
        },
      },
      statuses: {
        name: "상태",
        description:
          "다른 컴포넌트의 `preset`과 유사한 상태 속성이 있으며, 컴포넌트의 기능에도 영향을 미칩니다.",
        noStatus: "상태 없음 - 기본 상태",
        errorStatus: "오류 상태 - 오류가 있을 때 사용",
        disabledStatus: "비활성 상태 - 편집 기능을 비활성화하고 입력을 표시하지 않음",
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        useCase: {
          checkBox: {
            label: "`labelTx` 속성으로",
            helper: "`helperTx` 속성으로",
          },
          checkBoxMultiLine: {
            helper: "멀티라인 지원 - 멀티라인 지원을 위한 예제 문장입니다. 하나 둘 셋.",
          },
          radioChangeSides: {
            helper: "양쪽을 변경할 수 있습니다 - 양쪽 변경을 위한 예제 문장입니다. 하나 둘 셋.",
          },
          customCheckBox: {
            label: "맞춤 체크박스 아이콘 전달.",
          },
          switch: {
            label: "스위치는 텍스트로 읽을 수 있습니다",
            helper:
              "기본적으로 이 옵션은 `Text`를 사용하지 않습니다. 폰트에 따라 켜기/끄기 문자가 이상하게 보일 수 있기 때문입니다. 필요에 따라 커스터마이즈하세요.",
          },
          switchAid: {
            label: "또는 아이콘으로 보조",
          },
        },
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        outerWrapper: "1 - 입력 외부 래퍼 스타일링",
        innerWrapper: "2 - 입력 내부 래퍼 스타일링",
        inputDetail: "3 - 입력 디테일 스타일링",
        labelTx: "labelTx도 스타일링할 수 있습니다",
        styleContainer: "또는 전체 컨테이너 스타일링",
      },
    },
  },
  demoButton: {
    description:
      "사용자가 작업을 수행하고 선택을 할 수 있도록 하는 컴포넌트입니다. Text 컴포넌트를 Pressable 컴포넌트로 감쌉니다.",
    useCase: {
      presets: {
        name: "프리셋",
        description: "사전 구성된 몇 가지 프리셋이 있습니다.",
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        viaTextProps: "`text` 속성으로 - 예제 문장입니다.",
        children: "자식 - 또 다른 예제 문장입니다.",
        rightAccessory: "오른쪽 액세서리 - 예제 문장입니다.",
        leftAccessory: "왼쪽 액세서리 - 예제 문장입니다.",
        nestedChildren: "중첩 자식 - 별 하나에 추억과 별 하나에 사랑과 별 하나에 쓸쓸함과",
        nestedChildren2: "별 하나에 동경과 별 하나에 시와 ",
        nestedChildren3: "별 하나에 어머니, 어머니.",
        multiLine:
          "멀티라인 - 죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를, 잎새에 이는 바람에도 나는 괴로워했다. 별을 노래하는 마음으로 모든 죽어 가는 것을 사랑해야지 그리고 나한테 주어진 길을 걸어가야겠다. 오늘 밤에도 별이 바람에 스치운다.",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        styleContainer: "스타일 컨테이너 - 예제 문장",
        styleText: "스타일 텍스트 - 예제 문장",
        styleAccessories: "스타일 액세서리 - 또 다른 예제 문장",
        pressedState: "스타일 눌린 상태 - 예제 문장",
      },
      disabling: {
        name: "비활성화",
        description:
          "컴포넌트는 비활성화할 수 있으며, 그에 따라 스타일링할 수 있습니다. 누르는 동작이 비활성화됩니다.",
        standard: "비활성화 - 표준",
        filled: "비활성화 - 채워진",
        reversed: "비활성화 - 역방향",
        accessory: "비활성화된 액세서리 스타일",
        textStyle: "비활성화된 텍스트 스타일",
      },
    },
  },
  demoListItem: {
    description: "FlatList, SectionList 또는 자체적으로 사용할 수 있는 스타일된 행 컴포넌트입니다.",
    useCase: {
      height: {
        name: "높이",
        description: "행은 다른 높이를 가질 수 있습니다.",
        defaultHeight: "기본 높이 (56px)",
        customHeight: "`height` 속성을 통해 사용자 정의 높이",
        textHeight:
          "텍스트 내용에 의해 결정된 높이 - 예제를 위한 긴 문장입니다. 하나 둘 셋. 안녕하세요.",
        longText:
          "긴 텍스트를 한 줄로 제한 - 이것 역시 예제를 위한 긴 문장입니다. 오늘 날씨는 어떤가요?",
      },
      separators: {
        name: "구분선",
        description: "구분선 / 디바이더가 사전 구성되어 있으며 선택 사항입니다.",
        topSeparator: "상단 구분선만",
        topAndBottomSeparator: "상단 및 하단 구분선",
        bottomSeparator: "하단 구분선만",
      },
      icons: {
        name: "아이콘",
        description: "왼쪽 또는 오른쪽 아이콘을 사용자 정의할 수 있습니다.",
        leftIcon: "왼쪽 아이콘",
        rightIcon: "오른쪽 아이콘",
        leftRightIcons: "왼쪽 및 오른쪽 아이콘",
      },
      customLeftRight: {
        name: "사용자 정의 왼쪽/오른쪽 컴포넌트",
        description: "필요시에는 사용자가 정의한 왼쪽/오른쪽 컴포넌트를 전달할 수 있습니다.",
        customLeft: "사용자 정의 왼쪽 컴포넌트",
        customRight: "사용자 정의 오른쪽 컴포넌트",
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        text: "`text` 속성으로 - 예제 문장입니다.",
        children: "자식 - 또 다른 예제 문장입니다.",
        nestedChildren1: "중첩 자식 - 이것도 예제 문장입니다..",
        nestedChildren2: "또 다른 예제 문장, 중첩이 된 형태입니다.",
      },
      listIntegration: {
        name: "FlatList 및 FlashList 통합",
        description: "이 컴포넌트는 선호하는 리스트 인터페이스와 쉽게 통합할 수 있습니다.",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        styledText: "스타일된 텍스트",
        styledContainer: "스타일된 컨테이너 (구분선)",
        tintedIcons: "색이 입혀진 아이콘",
      },
    },
  },
  demoCard: {
    description:
      "카드는 관련 정보를 컨테이너에 담아 표시하는 데 유용합니다. ListItem이 내용을 수평으로 표시한다면, 카드는 내용을 수직으로 표시할 수 있습니다.",
    useCase: {
      presets: {
        name: "프리셋",
        description: "사전 구성된 몇 가지 프리셋이 있습니다.",
        default: {
          heading: "기본 프리셋 (기본값)",
          content: "예제 문장입니다. 그믐밤 반디불은 부서진 달조각",
          footer: "숲으로 가자 달조각을 주으려 숲으로 가자.",
        },
        reversed: {
          heading: "역방향 프리셋",
          content: "예제 문장입니다. 그믐밤 반디불은 부서진 달조각",
          footer: "숲으로 가자 달조각을 주으려 숲으로 가자.",
        },
      },
      verticalAlignment: {
        name: "수직 정렬",
        description: "카드는 필요에 따라 미리 구성된 다양한 정렬방법으로 제공됩니다.",
        top: {
          heading: "상단 (기본값)",
          content: "모든 콘텐츠가 자동으로 상단에 정렬됩니다.",
          footer: "심지어 푸터도",
        },
        center: {
          heading: "중앙",
          content: "콘텐츠는 카드 높이에 상대적으로 중앙에 배치됩니다.",
          footer: "나도!",
        },
        spaceBetween: {
          heading: "공간 사이",
          content: "모든 콘텐츠가 고르게 간격을 둡니다.",
          footer: "나는 내가 있고 싶은 곳에 있어요.",
        },
        reversed: {
          heading: "푸터 강제 하단",
          content: "푸터를 원하는 위치에 밀어 넣습니다.",
          footer: "여기 너무 외로워요.",
        },
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        heading: "`heading` 속성으로",
        content: "`content` 속성으로",
        footer: "푸터도 외로워요.",
      },
      customComponent: {
        name: "사용자 정의 컴포넌트",
        description:
          "사전 구성된 컴포넌트 중 하나를 직접 만든 자신의 컴포넌트로 대체할 수 있습니다. 추가 컴포넌트도 덧붙여 넣을 수 있습니다.",
        rightComponent: "오른쪽 컴포넌트",
        leftComponent: "왼쪽 컴포넌트",
      },
      style: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        heading: "헤딩 스타일링",
        content: "컨텐츠 스타일링",
        footer: "푸터 스타일링",
      },
    },
  },
  demoAutoImage: {
    description: "원격 또는 data-uri 이미지의 크기를 자동으로 조정하는 Image 컴포넌트입니다.",
    useCase: {
      remoteUri: { name: "원격 URI" },
      base64Uri: { name: "Base64 URI" },
      scaledToFitDimensions: {
        name: "치수에 맞게 조정",
        description:
          "`maxWidth` 단독으로, 혹은 `maxHeight` 속성과 함께 제공하면, 이미지는 비율을 유지하면서 자동으로 크기가 조정됩니다. 이것이 `resizeMode: 'contain'`과 다른 점은 무엇일까요? 첫째, 한쪽 크기만 지정할 수 있습니다. 둘째, 이미지가 이미지 컨테이너 내에 포함되는 대신 원하는 치수에 맞게 조정됩니다.",
        heightAuto: "너비: 60 / 높이: 자동",
        widthAuto: "너비: 자동 / 높이: 32",
        bothManual: "너비: 60 / 높이: 60",
      },
    },
  },
  demoText: {
    description:
      "텍스트 표시가 필요한 경우를 위해, 이 컴포넌트는 기본 React Native 컴포넌트 위에 HOC로 제작되었습니다.",
    useCase: {
      presets: {
        name: "프리셋",
        description: "사전 구성된 몇 가지 프리셋이 있습니다.",
        default: "기본 프리셋 - 예제 문장입니다. 하나 둘 셋.",
        bold: "볼드 프리셋 - 예제 문장입니다. 하나 둘 셋.",
        subheading: "서브헤딩 프리셋 - 예제 문장입니다. 하나 둘 셋.",
        heading: "헤딩 프리셋 - 예제 문장입니다. 하나 둘 셋.",
      },
      sizes: {
        name: "크기",
        description: "크기 속성이 있습니다.",
        xs: "xs - 조금 더 작은 크기 속성입니다.",
        sm: "sm - 작은 크기 속성입니다.",
        md: "md - 중간 크기 속성입니다.",
        lg: "lg - 큰 크기 속성입니다.",
        xl: "xl - 조금 더 큰 크기 속성입니다.",
        xxl: "xxl - 아주 큰 크기 속성입니다.",
      },
      weights: {
        name: "굵기",
        description: "굵기 속성이 있습니다.",
        light: "가벼움 - 예제 문장입니다. 안녕하세요. 하나 둘 셋.",
        normal: "보통 - 예제 문장입니다. 안녕하세요. 하나 둘 셋.",
        medium: "중간 - 예제 문장입니다. 안녕하세요. 하나 둘 셋.",
        semibold: "세미볼드 - 예제 문장입니다. 안녕하세요. 하나 둘 셋.",
        bold: "볼드 - 예제 문장입니다. 안녕하세요. 하나 둘 셋.",
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        viaText:
          "`text` 속성으로 - 죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를, 잎새에 이는 바람에도 나는 괴로워했다. 별을 노래하는 마음으로 모든 죽어 가는 것을 사랑해야지 그리고 나한테 주어진 길을 걸어가야겠다. 오늘 밤에도 별이 바람에 스치운다.",
        viaTx: "`tx` 속성으로",
        children: "자식 - 또 다른 예제 문장입니다. 하나 둘 셋.",
        nestedChildren: "중첩 자식",
        nestedChildren2: "죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를, ",
        nestedChildren3: "잎새에 이는 바람에도 나는 괴로워했다.",
        nestedChildren4: "별을 노래하는 마음으로 모든 죽어 가는 것을 사랑해야지.",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        text: "그리고 나한테 주어진 길을 걸어가야겠다.",
        text2: "오늘 밤에도 별이 바람에 스치운다.",
        text3: "계속 이어지는 예제 문장입니다. 하나 둘 셋.",
      },
    },
  },
  demoHeader: {
    description:
      "여러 화면에 나타나는 컴포넌트입니다. 네비게이션 버튼과 화면 제목을 포함할 것입니다.",
    useCase: {
      actionIcons: {
        name: "액션 아이콘",
        description: "왼쪽 또는 오른쪽 액션 컴포넌트에 아이콘을 쉽게 전달할 수 있습니다.",
        leftIconTitle: "왼쪽 아이콘",
        rightIconTitle: "오른쪽 아이콘",
        bothIconsTitle: "양쪽 아이콘",
      },
      actionText: {
        name: "액션 텍스트",
        description: "왼쪽 또는 오른쪽 액션 컴포넌트에 텍스트를 쉽게 전달할 수 있습니다.",
        leftTxTitle: "`leftTx`를 통해",
        rightTextTitle: "`rightText`를 통해",
      },
      customActionComponents: {
        name: "사용자 정의 액션 컴포넌트",
        description:
          "아이콘이나 텍스트 옵션이 충분하지 않은 경우, 사용자 정의 액션 컴포넌트를 전달할 수 있습니다.",
        customLeftActionTitle: "사용자 정의 왼쪽 액션",
      },
      titleModes: {
        name: "제목 모드",
        description:
          "제목은 기본적으로 중앙에 고정되지만 너무 길면 잘릴 수 있습니다. 액션 버튼에 맞춰 조정할 수 있습니다.",
        centeredTitle: "중앙 제목",
        flexTitle: "유연한 제목",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
        styledTitle: "스타일된 제목",
        styledWrapperTitle: "스타일된 래퍼",
        tintedIconsTitle: "색이 입혀진 아이콘",
      },
    },
  },
  demoEmptyState: {
    description:
      "표시할 데이터가 없을 때 사용할 수 있는 컴포넌트입니다. 사용자가 다음에 무엇을 할지 안내할 수 있습니다.",
    useCase: {
      presets: {
        name: "프리셋",
        description:
          "다양한 텍스트/이미지 세트를 만들 수 있습니다. `generic`이라는 사전 정의된 세트가 하나 있습니다. 기본값이 없으므로 완전히 사용자 정의된 EmptyState를 원할 경우 사용할 수 있습니다.",
      },
      passingContent: {
        name: "내용 전달",
        description: "내용을 전달하는 몇 가지 방법이 있습니다.",
        customizeImageHeading: "이미지 맞춤 설정",
        customizeImageContent: "어떤 이미지 소스도 전달할 수 있습니다.",
        viaHeadingProp: "`heading` 속성으로",
        viaContentProp: "`content` 속성으로",
        viaButtonProp: "`button` 속성으로",
      },
      styling: {
        name: "스타일링",
        description: "컴포넌트는 쉽게 스타일링할 수 있습니다.",
      },
    },
  },
}

export default demoKo

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/fr.ts

import demoFr from "./demo-fr"
import { Translations } from "./en"

const fr: Translations = {
  common: {
    ok: "OK !",
    cancel: "Annuler",
    back: "Retour",
    logOut: "Déconnexion", // @demo remove-current-line
  },
  welcomeScreen: {
    postscript:
      "psst  — Ce n'est probablement pas à quoi ressemble votre application. (À moins que votre designer ne vous ait donné ces écrans, dans ce cas, mettez la en prod !)",
    readyForLaunch: "Votre application, presque prête pour le lancement !",
    exciting: "(ohh, c'est excitant !)",
    letsGo: "Allons-y !", // @demo remove-current-line
  },
  errorScreen: {
    title: "Quelque chose s'est mal passé !",
    friendlySubtitle:
      "C'est l'écran que vos utilisateurs verront en production lorsqu'une erreur sera lancée. Vous voudrez personnaliser ce message (situé dans `app/i18n/fr.ts`) et probablement aussi la mise en page (`app/screens/ErrorScreen`). Si vous voulez le supprimer complètement, vérifiez `app/app.tsx` pour le composant <ErrorBoundary>.",
    reset: "RÉINITIALISER L'APPLICATION",
    traceTitle: "Erreur depuis %{name}", // @demo remove-current-line
  },
  emptyStateComponent: {
    generic: {
      heading: "Si vide... si triste",
      content:
        "Aucune donnée trouvée pour le moment. Essayez de cliquer sur le bouton pour rafraîchir ou recharger l'application.",
      button: "Essayons à nouveau",
    },
  },
  // @demo remove-block-start
  errors: {
    invalidEmail: "Adresse e-mail invalide.",
  },
  loginScreen: {
    logIn: "Se connecter",
    enterDetails:
      "Entrez vos informations ci-dessous pour débloquer des informations top secrètes. Vous ne devinerez jamais ce que nous avons en attente. Ou peut-être que vous le ferez ; ce n'est pas de la science spatiale ici.",
    emailFieldLabel: "E-mail",
    passwordFieldLabel: "Mot de passe",
    emailFieldPlaceholder: "Entrez votre adresse e-mail",
    passwordFieldPlaceholder: "Mot de passe super secret ici",
    tapToLogIn: "Appuyez pour vous connecter!",
    hint: "Astuce : vous pouvez utiliser n'importe quelle adresse e-mail et votre mot de passe préféré :)",
  },
  demoNavigator: {
    componentsTab: "Composants",
    debugTab: "Débogage",
    communityTab: "Communauté",
    podcastListTab: "Podcasts",
  },
  demoCommunityScreen: {
    title: "Connectez-vous avec la communauté",
    tagLine:
      "Rejoignez la communauté d'ingénieurs React Native d'Infinite Red et améliorez votre développement d'applications avec nous !",
    joinUsOnSlackTitle: "Rejoignez-nous sur Slack",
    joinUsOnSlack:
      "Vous souhaitez vous connecter avec des ingénieurs React Native du monde entier ? Rejoignez la conversation dans la communauté Slack d'Infinite Red ! Notre communauté en pleine croissance est un espace sûr pour poser des questions, apprendre des autres et développer votre réseau.",
    joinSlackLink: "Rejoindre la communauté Slack",
    makeIgniteEvenBetterTitle: "Rendre Ignite encore meilleur",
    makeIgniteEvenBetter:
      "Vous avez une idée pour rendre Ignite encore meilleur ? Nous sommes heureux de l'entendre ! Nous cherchons toujours des personnes qui veulent nous aider à construire les meilleurs outils React Native. Rejoignez-nous sur GitHub pour nous aider à construire l'avenir d'Ignite.",
    contributeToIgniteLink: "Contribuer à Ignite",
    theLatestInReactNativeTitle: "Les dernières nouvelles de React Native",
    theLatestInReactNative:
      "Nous sommes là pour vous tenir au courant de tout ce que React Native a à offrir.",
    reactNativeRadioLink: "React Native Radio",
    reactNativeNewsletterLink: "React Native Newsletter",
    reactNativeLiveLink: "React Native Live",
    chainReactConferenceLink: "Conférence Chain React",
    hireUsTitle: "Engagez Infinite Red pour votre prochain projet",
    hireUs:
      "Que ce soit pour gérer un projet complet ou pour former des équipes à notre formation pratique, Infinite Red peut vous aider pour presque tous les projets React Native.",
    hireUsLink: "Envoyez-nous un message",
  },
  demoShowroomScreen: {
    jumpStart: "Composants pour démarrer votre projet !",
    lorem2Sentences:
      "Nulla cupidatat deserunt amet quis aliquip nostrud do adipisicing. Adipisicing excepteur elit laborum Lorem adipisicing do duis.",
    demoHeaderTxExample: "Yay",
    demoViaTxProp: "Via la propriété `tx`",
    demoViaSpecifiedTxProp: "Via la propriété `{{prop}}Tx` spécifiée",
  },
  demoDebugScreen: {
    howTo: "COMMENT FAIRE",
    title: "Débugage",
    tagLine:
      "Félicitations, vous avez un modèle d'application React Native très avancé ici. Profitez de cette base de code !",
    reactotron: "Envoyer à Reactotron",
    reportBugs: "Signaler des bugs",
    demoList: "Liste de démonstration",
    demoPodcastList: "Liste de podcasts de démonstration",
    androidReactotronHint:
      "Si cela ne fonctionne pas, assurez-vous que l'application de bureau Reactotron est en cours d'exécution, exécutez adb reverse tcp:9090 tcp:9090 à partir de votre terminal, puis rechargez l'application.",
    iosReactotronHint:
      "Si cela ne fonctionne pas, assurez-vous que l'application de bureau Reactotron est en cours d'exécution, puis rechargez l'application.",
    macosReactotronHint:
      "Si cela ne fonctionne pas, assurez-vous que l'application de bureau Reactotron est en cours d'exécution, puis rechargez l'application.",
    webReactotronHint:
      "Si cela ne fonctionne pas, assurez-vous que l'application de bureau Reactotron est en cours d'exécution, puis rechargez l'application.",
    windowsReactotronHint:
      "Si cela ne fonctionne pas, assurez-vous que l'application de bureau Reactotron est en cours d'exécution, puis rechargez l'application.",
  },
  demoPodcastListScreen: {
    title: "Épisodes de Radio React Native",
    onlyFavorites: "Afficher uniquement les favoris",
    favoriteButton: "Favori",
    unfavoriteButton: "Non favori",
    accessibility: {
      cardHint:
        "Double-cliquez pour écouter l'épisode. Double-cliquez et maintenez pour {{action}} cet épisode.",
      switch: "Activez pour afficher uniquement les favoris",
      favoriteAction: "Basculer en favori",
      favoriteIcon: "Épisode non favori",
      unfavoriteIcon: "Épisode favori",
      publishLabel: "Publié le {{date}}",
      durationLabel: "Durée : {{hours}} heures {{minutes}} minutes {{seconds}} secondes",
    },
    noFavoritesEmptyState: {
      heading: "C'est un peu vide ici",
      content:
        "Aucun favori n'a été ajouté pour le moment. Appuyez sur le cœur d'un épisode pour l'ajouter à vos favoris !",
    },
  },
  // @demo remove-block-start
  ...demoFr,
  // @demo remove-block-end
}

export default fr

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/demo-jp.ts

import { DemoTranslations } from "./demo-en"

export const demoJp: DemoTranslations = {
  demoIcon: {
    description:
      "あらかじめ登録されたアイコンを描画するコンポーネントです。 `onPress` が提供されている場合は <TouchableOpacity /> にラップされますが、それ以外の場合は <View /> にラップされます。",
    useCase: {
      icons: {
        name: "アイコン",
        description: "登録されたアイコンのリストです。",
      },
      size: {
        name: "サイズ",
        description: "sizeのpropsです。",
      },
      color: {
        name: "カラー",
        description: "colorのpropsです。",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
      },
    },
  },
  demoTextField: {
    description: "このコンポーネントはテキストの入力と編集ができます。",
    useCase: {
      statuses: {
        name: "ステータス",
        description:
          "status - これは他コンポーネントの`preset`の似ていますが、これはコンポーネントの機能も変えるpropsです。",
        noStatus: {
          label: "ステータスなし",
          helper: "デフォルトのステータスです",
          placeholder: "テキストが入力されます",
        },
        error: {
          label: "エラーステータス",
          helper: "エラーが発生した場合に使用されるステータスです",
          placeholder: "ここにテキストが入力されます",
        },
        disabled: {
          label: "無効(disabled)ステータス",
          helper: "編集不可となるステータスです",
          placeholder: "ここにテキストが入力されます",
        },
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        viaLabel: {
          labelTx: "`label` から",
          helper: "`helper` から",
          placeholder: "`placeholder` から",
        },
        rightAccessory: {
          label: "右側にアクセサリー",
          helper: "このpropsはReact要素を返す関数をうけとります。",
        },
        leftAccessory: {
          label: "左側にアクセサリー",
          helper: "このpropsはReact要素を返す関数をうけとります。",
        },
        supportsMultiline: {
          label: "複数行サポート",
          helper: "複数行の入力が出来るようになります。",
        },
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        styleInput: {
          label: "インプットのスタイル",
          helper: "`style`から",
        },
        styleInputWrapper: {
          label: "インプットラッパーのスタイル",
          helper: "`inputWrapperStyle`から",
        },
        styleContainer: {
          label: "スタイルコンテナのスタイル",
          helper: "`containerStyle`から",
        },
        styleLabel: {
          label: "ラベルとヘルパーのスタイル",
          helper: "`LabelTextProps` & `HelperTextProps`から",
        },
        styleAccessories: {
          label: "アクセサリーのスタイル",
          helper: "`RightAccessory` & `LeftAccessory`から",
        },
      },
    },
  },
  demoToggle: {
    description:
      "ブーリアンの入力を表示するコンポーネントです。コンポーネントはvalueの値を使用して描画するので、onValueChangeコールバックを使って値を変更し、valueを更新する必要があります。valueの値が変更されていない場合は、描画が更新されません。",
    useCase: {
      variants: {
        name: "バリエーション",
        description:
          "このコンポーネントは数種類のバリエーションをサポートしています。もしカスタマイズが必要な場合、これらのバリエーションをリファクタリングできます。デフォルトは`checkbox`です。",
        checkbox: {
          label: "`checkbox`バリエーション",
          helper: "シンプルなon/offのインプットに使えます。",
        },
        radio: {
          label: "`radio`バリエーション",
          helper: "数個のオプションがある場合に使えます。",
        },
        switch: {
          label: "`switch`バリエーション",
          helper:
            "代表的なon/offのインプットです。他と比べアクセシビリティのサポートが充実しています。",
        },
      },
      statuses: {
        name: "ステータス",
        description:
          "status - これは他コンポーネントの`preset`の似ていますが、これはコンポーネントの機能も変えるpropsです。",
        noStatus: "ステータスなし - デフォルトです。",
        errorStatus: "エラー - エラーがある際に使えるステータスです。",
        disabledStatus: "無効(disabled) - 編集不可となるステータスです",
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        useCase: {
          checkBox: {
            label: "`labelTx`から",
            helper: "`helperTx`から",
          },
          checkBoxMultiLine: {
            helper: "複数行サポート - Nulla proident consectetur labore sunt ea labore. ",
          },
          radioChangeSides: {
            helper: "左右に変更 - Laborum labore adipisicing in eu ipsum deserunt.",
          },
          customCheckBox: {
            label: "カスタムアイコンも渡せます",
          },
          switch: {
            label: "スイッチはテキストとして読むこともできます。",
            helper:
              "デフォルトでは、このオプションはフォントの影響を受け、見た目が見苦しくなる可能性がある為`Text`コンポーネントを使用していません。必要に応じてカスタマイズしてください。",
          },
          switchAid: {
            label: "または補助アイコンもつけられます",
          },
        },
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        outerWrapper: "1 - インプットの外側のラッパー",
        innerWrapper: "2 - インプットの内側のラッパー",
        inputDetail: "3 - インプットのそのもの",
        labelTx: "ラベルのスタイルも変更できます。",
        styleContainer: "もしくは、コンポーネントのコンテナ全体をスタイルすることもできます。",
      },
    },
  },
  demoButton: {
    description:
      "ユーザーにアクションや選択を促すコンポーネントです。`Text`コンポーネントを`Pressable`コンポーネントでラップしています。",
    useCase: {
      presets: {
        name: "プリセット",
        description: "数種類のプリセットが用意されています。",
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        viaTextProps: "`text`から - Billum In",
        children: "Childrenから - Irure Reprehenderit",
        rightAccessory: "RightAccessoryから - Duis Quis",
        leftAccessory: "LeftAccessoryから - Duis Proident",
        nestedChildren: "ネストされたchildrenから - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren3: "Occaecat aliqua irure proident veniam.",
        multiLine:
          "Multilineから - consequat veniam veniam reprehenderit. Fugiat id nisi quis duis sunt proident mollit dolor mollit adipisicing proident deserunt.",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        styleContainer: "コンテナのスタイル - Exercitation",
        styleText: "テキストのスタイル - Ea Anim",
        styleAccessories: "アクセサリーのスタイル - enim ea id fugiat anim ad.",
        pressedState: "押された状態のスタイル - fugiat anim",
      },
      disabling: {
        name: "無効化",
        description:
          "このコンポーネントは無効化できます。スタイルも同時に変更され、押した際の挙動も無効化されます。",
        standard: "無効化 - standard",
        filled: "無効化 - filled",
        reversed: "無効化 - reversed",
        accessory: "無効化されたアクセサリーのスタイル",
        textStyle: "無効化されたテキストのスタイル",
      },
    },
  },
  demoListItem: {
    description:
      "スタイルを指定されたリストの行のコンポーネントです。FlatListやSectionListなどのコンポーネントを使用することもできますし、単体でも使用できます。",
    useCase: {
      height: {
        name: "高さ",
        description: "高さの指定ができます。",
        defaultHeight: "デフォルトの高さ (56px)",
        customHeight: "`height`を使ったカスタムの高さ",
        textHeight:
          "テキストによって決まった高さ - Reprehenderit incididunt deserunt do do ea labore.",
        longText: "テキストを1行に制限する- Reprehenderit incididunt deserunt do do ea labore.",
      },
      separators: {
        name: "セパレーター",
        description: "セパレーター/ディバイダーは用意されてるかつ任意です。",
        topSeparator: "トップセパレーターのみ",
        topAndBottomSeparator: "トップとボトムのセパレーター",
        bottomSeparator: "ボトムのセパレーター",
      },
      icons: {
        name: "アイコン",
        description: "右または左のアイコンをカスタマイズすることができます。",
        leftIcon: "左のアイコン",
        rightIcon: "右のアイコン",
        leftRightIcons: "左右のアイコン",
      },
      customLeftRight: {
        name: "左右のコンポーネントのカスタマイズ",
        description: "左右のコンポーネントをカスタマイズすることができます。",
        customLeft: "カスタムされた左コンポーネント",
        customRight: "カスタムされた右コンポーネント",
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        text: "`text`から - reprehenderit sint",
        children: "Childrenから - mostrud mollit",
        nestedChildren1: "ネストされたchildrenから - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
      },
      listIntegration: {
        name: "FlatList & FlashListに組みこむ場合",
        description:
          "このコンポーネントはお好みのリスト系のコンポーネントへ容易に組み込むことができます。",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        styledText: "スタイルされたテキスト",
        styledContainer: "スタイルされたコンテナ(セパレーター)",
        tintedIcons: "アイコンに色をつける",
      },
    },
  },
  demoCard: {
    description:
      "カードは関連する情報同士をまとめるのに役立ちます。ListItemが横に情報を表示するのに使え、こちらは縦に表示するのに使えます。",
    useCase: {
      presets: {
        name: "プリセット",
        description: "数種類のプリセットが用意されています。",
        default: {
          heading: "デフォルトのプリセット",
          content: "Incididunt magna ut aliquip consectetur mollit dolor.",
          footer: "Consectetur nulla non aliquip velit.",
        },
        reversed: {
          heading: "リバースのプリセット",
          content: "Reprehenderit occaecat proident amet id laboris.",
          footer: "Consectetur tempor ea non labore anim .",
        },
      },
      verticalAlignment: {
        name: "縦の位置調整",
        description: "カードは用意されたプリセットを使っての縦位置調整ができます。",
        top: {
          heading: "Top(デフォルト)",
          content: "全てのコンテンツは自動的に上に配置されます。",
          footer: "Footerも同じように上に配置されます。",
        },
        center: {
          heading: "センター",
          content: "全てのコンテンツはカードの高さから見て中央に配置されます。",
          footer: "Footerである私も!",
        },
        spaceBetween: {
          heading: "Space Between",
          content: "全てのコンテンツは均等に分配されます。",
          footer: "Footerの私はここが一番落ち着くね",
        },
        reversed: {
          heading: "Footerのみを下に配置する",
          content: "その名の通り、Footerのみを下に配置することができます。",
          footer: "Footerは一人で寂しい",
        },
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        heading: "`heading`から",
        content: "`content`から",
        footer: "`footer`から",
      },
      customComponent: {
        name: "カスタムコンポーネント",
        description:
          "全てのプリセットはカスタムコンポーネントを使って拡張/変更することができます。",
        rightComponent: "右コンポーネント",
        leftComponent: "左コンポーネント",
      },
      style: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        heading: "ヘディングのスタイル",
        content: "コンテントのスタイル",
        footer: "フッターのスタイル",
      },
    },
  },
  demoAutoImage: {
    description: "リモートまたはデータURIによって自動的にサイズを変更する画像コンポーネントです。",
    useCase: {
      remoteUri: { name: "リモート URI" },
      base64Uri: { name: "Base64 URI" },
      scaledToFitDimensions: {
        name: "ディメンションにフィットするように拡大する",
        description:
          "`maxWidth` と/または `maxHeight`を指定することで、アスペクト比を維持したままサイズを変更することができます。`resizeMode: 'contain'`との違いとしては: \n1. 一方のサイズの指定でも良い（両方の指定の必要がない）。 \n2. 画像のコンテナに押し込められるのではなく、画像のディメンションを保ったまま指定したサイズに拡大、縮小を行うことができます。",
        heightAuto: "width: 60 / height: auto",
        widthAuto: "width: auto / height: 32",
        bothManual: "width: 60 / height: 60",
      },
    },
  },
  demoText: {
    description:
      "テキストを表示する為のコンポーネントです。これはReact NativeのTextコンポーネントを内包する高階コンポーネント(Higher Order Component)です。",
    useCase: {
      presets: {
        name: "プリセット",
        description: "数種類のプリセットが用意されています。",
        default:
          "デフォルトのプリセット - Cillum eu laboris in labore. Excepteur mollit tempor reprehenderit fugiat elit et eu consequat laborum.",
        bold: "ボールドのプリセット - Tempor et ullamco cupidatat in officia. Nulla ea duis elit id sunt ipsum cillum duis deserunt nostrud ut nostrud id.",
        subheading: "サブヘディングのプリセット - In Cupidatat Cillum.",
        heading: "ヘディングのプリセット - Voluptate Adipis.",
      },
      sizes: {
        name: "サイズ",
        description: "サイズ用のpropsです.",
        xs: "xs - Ea ipsum est ea ex sunt.",
        sm: "sm - Lorem sunt adipisicin.",
        md: "md - Consequat id do lorem.",
        lg: "lg - Nostrud ipsum ea.",
        xl: "xl - Eiusmod ex excepteur.",
        xxl: "xxl - Cillum eu laboris.",
      },
      weights: {
        name: "ウエイト",
        description: "ウエイト用のpropです。",
        light:
          "ライト - Nulla magna incididunt excepteur est occaecat duis culpa dolore cupidatat enim et.",
        normal:
          "ノーマル - Magna incididunt dolor ut veniam veniam laboris aliqua velit ea incididunt.",
        medium: "ミディアム - Non duis laborum quis laboris occaecat culpa cillum.",
        semibold: "セミボールド - Exercitation magna nostrud pariatur laborum occaecat aliqua.",
        bold: "ボールド - Eiusmod ullamco magna exercitation est excepteur.",
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        viaText:
          "`text`から - Billum in aute fugiat proident nisi pariatur est. Cupidatat anim cillum eiusmod ad. Officia eu magna aliquip labore dolore consequat.",
        viaTx: "`tx`から -",
        children: "childrenから - Aliqua velit irure reprehenderit eu qui amet veniam consectetur.",
        nestedChildren: "ネストされたchildrenから -",
        nestedChildren2: "Occaecat aliqua irure proident veniam.",
        nestedChildren3: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren4: "Occaecat aliqua irure proident veniam.",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        text: "Consequat ullamco veniam velit mollit proident excepteur aliquip id culpa ipsum velit sint nostrud.",
        text2:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
        text3:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
      },
    },
  },
  demoHeader: {
    description:
      "様々なスクリーンで登場するコンポーネントです。ナビゲーションのボタンとスクリーンタイトルを含みます。",
    useCase: {
      actionIcons: {
        name: "アクションアイコン",
        description: "左右にアイコンを表示させることができます。",
        leftIconTitle: "左アイコン",
        rightIconTitle: "右アイコン",
        bothIconsTitle: "両方のアイコン",
      },
      actionText: {
        name: "アクションテキスト",
        description: "左右にテキストを表示させることができます。",
        leftTxTitle: "`leftTx`から",
        rightTextTitle: "`rightText`から",
      },
      customActionComponents: {
        name: "カスタムアクションコンポーネント",
        description:
          "アイコンまたはテキスト以外のものが必要な場合は、カスタムのアクションコンポーネントを渡すことができます。",
        customLeftActionTitle: "カスタムの左アクション",
      },
      titleModes: {
        name: "タイトルモード",
        description:
          "タイトルはデフォルトで中央に配置されますが、長すぎるとカットされてしまいます。Flexを使うことでアクションボタンから自動的にポジションを調整することもできます。",
        centeredTitle: "Centered Title",
        flexTitle: "Flex Title",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
        styledTitle: "スタイルされたタイトル",
        styledWrapperTitle: "スタイルされたラッパー",
        tintedIconsTitle: "色付けされたアイコン",
      },
    },
  },
  demoEmptyState: {
    description:
      "表示する為のデータが存在しない場合に使えるコンポーネントです。ユーザーに取るべきアクションをお勧めする際に有用です。",
    useCase: {
      presets: {
        name: "プリセット",
        description:
          "text/imageのセットを使ってカスタマイズすることができます。これは`generic`のものです。カスタマイズが必要になることを想定して、このコンポーネントにデフォルトのプリセットは存在しません。",
      },
      passingContent: {
        name: "コンテントを渡す",
        description: "コンテントを渡す方法はいくつかあります。",
        customizeImageHeading: "画像をカスタマイズ",
        customizeImageContent: "画像のソースを渡すことができます。",
        viaHeadingProp: "`heading`から",
        viaContentProp: "`content`から",
        viaButtonProp: "`button`から",
      },
      styling: {
        name: "スタイリング",
        description: "このコンポーネントはスタイリングの変更ができます。",
      },
    },
  },
}

export default demoJp

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/demo-ar.ts

import { DemoTranslations } from "./demo-en"

export const demoAr: DemoTranslations = {
  demoIcon: {
    description:
      "مكون لعرض أيقونة مسجلة.يتم تغليفه في <TouchableOpacity> يتم توفير 'OnPress'، وإلا يتم توفير <View",
    useCase: {
      icons: {
        name: "Icons",
        description: "قائمة الرموز المسجلة داخل المكون.",
      },
      size: {
        name: "Size",
        description: "هناك حجم الدعامة.",
      },
      color: {
        name: "لون",
        description: "هناك لون الدعامة.",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة.",
      },
    },
  },
  demoTextField: {
    description: "TextField يسمح المكون بإدخال النص وتحريره.",
    useCase: {
      statuses: {
        name: "الحالات",
        description:
          "هناك حالة مماثلة ل 'preset' في المكونات الأخرى، ولكنها تؤثر على وظيفة المكون ايضاً.",
        noStatus: {
          label: "لا يوجد حالات",
          helper: "هذه هي الحالة الافتراضية",
          placeholder: "النص يذهب هنا",
        },
        error: {
          label: "حالة الخطأ",
          helper: "الحالة التي يجب استخدامها عند وجود خطأ",
          placeholder: "النص يذهب هنا",
        },
        disabled: {
          label: "حالة الإعاقة",
          helper: "يعطل إمكانية التحرير ويكتم النص",
          placeholder: "النص يذهب هنا",
        },
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى",
        viaLabel: {
          labelTx: "عبر 'label' الدعامة",
          helper: "عبر 'helper' الدعامة",
          placeholder: "عبر 'placeholder' الدعامة",
        },
        rightAccessory: {
          label: "RightAccessory",
          helper: "هذه الدعامة تأخذ دالة تقوم بإرجاع عنصر React",
        },
        leftAccessory: {
          label: "LeftAccessory",
          helper: "هذه الدعامة تأخذ دالة تقوم بإرجاع عنصر React",
        },
        supportsMultiline: {
          label: "يدعم Multiline",
          helper: "يتيح إدخالا اطول للنص متعدد الأسطر.",
        },
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة",
        styleInput: {
          label: "أسلوب الإدخال",
          helper: "عبر دعامة 'Style'",
        },
        styleInputWrapper: {
          label: "غلاف ادخال النمط",
          helper: "عبر دعامة 'InputWrapperStyle'",
        },
        styleContainer: {
          label: "حاوية النمط",
          helper: "عبر دعامة 'containerstyle'",
        },
        styleLabel: {
          label: "تسمية النمط والمساعد",
          helper: "عبر أسلوب الدعامة 'LabelTextProps' & 'HelperTextProps'",
        },
        styleAccessories: {
          label: "اكسسورات الاناقة",
          helper: "عبر أسلوب الدعامة 'RightAccessory' & 'LeftAccessory'",
        },
      },
    },
  },
  demoToggle: {
    description:
      "يقوم بعرض ادخال منطقي.هذا مكون خاضع للتحكم ويتطلب استدعاء OnValueChanger الذي يقوم بتحديث خاصية القيمة حتى يعكس المكون إجراءات المستخدم. إذا لم يتم تحديث خاصية القيمة، فسيستمر المكون في عرض خاصية القيمة المقدمة بدلا من النتيجة المتوقعة لأي إجراءات مستخدم.",
    useCase: {
      variants: {
        name: "المتغيرات",
        description:
          "تدعم المكونات عددا قليلا من المتغيرات المختلفة. اذا كانت هناك حاجة إلى تخصيص كبير لمتغير معين، فيمكن إعادة صياغته بسهولة. الافتراضي هو 'checkbox'",
        checkbox: {
          label: "'checkbox' متغير",
          helper: "يمكن استخدامه كمدخل تشغيل \\ إيقاف واحد",
        },
        radio: {
          label: "'radio' متغير",
          helper: "استخدام هذا عندما يكون لديك خيارات متعددة",
        },
        switch: {
          label: "'switch' متغير",
          helper: "مدخل تشغيل/إيقاف أكثر بروزا. يتمتع بدعم إمكانية الوصول بشكل أفضل.",
        },
      },
      statuses: {
        name: "الحالات",
        description:
          "هناك دعامة حالة مشابهة ل 'preset' في المكونات الأخرى، لكنها تؤثر على وظائف المكونات ايضاً",
        noStatus: "لا توجد حالات- هذا هو الوضع الافتراضي",
        errorStatus: "حالة الخطأ - استخدمها عندما يكون هناك خطأ",
        disabledStatus: "حالة معطلة- تعطيل إمكانية التحرير وكتم صوت الإدخال",
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى",
        useCase: {
          checkBox: {
            label: "عبر دعامة 'labelTx'",
            helper: "عبر دعامة 'helpertx'",
          },
          checkBoxMultiLine: {
            helper: "يدعم خطوط متعددة-Nulla provident consectetur labore sunt ea labore ",
          },
          radioChangeSides: {
            helper: "يمكنك تغيير الجانبين - Laborum labore adipisicing in eu ipsum deserunt.",
          },
          customCheckBox: {
            label: "مرر أيقونة مربع الاختيار المخصص",
          },
          switch: {
            label: "يمكن قراءة المفاتيح كنص",
            helper:
              "بشكل افتراضي، لا يستخدم هذا الخيار \"text' نظرا لأنه اعتمادا على الخط، قد تبدو الأحرف التي يتم تشغيلها/ايقافها غريبة. قم بالتخصيص حسب الحاجة",
          },
          switchAid: {
            label: "او بمساعدة أيقونة",
          },
        },
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة",
        outerWrapper: "١- تصميم الغلاف الخارجي للإدخال",
        innerWrapper: "٢- تصميم الغلاف الداخلي للإدخال",
        inputDetail: "٣- تصميم تفاصيل الإدخال",
        labelTx: "يمكنك ايضاً تصميم الملصق labelTx",
        styleContainer: "او، قم بتصميم الحاوية بأكملها",
      },
    },
  },
  demoButton: {
    description:
      "مكون يسمح للمستخدمين بإتخاذ الإجراءات والاختيارات. يلف مكون النص بمكون قابل للضغط",
    useCase: {
      presets: {
        name: "الإعدادات المسبقة",
        description: "هناك عدد قليل من الإعدادات المسبقة التي تم تكوينها مسبقاً",
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى",
        viaTextProps: "عبر الدعامة 'text'- Billum In",
        children: "أولاد- Irure Reprehenderit",
        rightAccessory: "RightAccessory - Duis Quis",
        leftAccessory: "LeftAccessory - Duis Proident",
        nestedChildren: "الأطفال المتداخلون-\tprovident genial",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren3: "Occaecat aliqua irure proident veniam.",
        multiLine:
          "Multiline - consequat veniam veniam reprehenderit. Fugiat id nisi quis duis sunt proident mollit dolor mollit adipisicing proident deserunt.",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة",
        styleContainer: "حاوية الأسلوب- الإثارة",
        styleText: "نص النمط- ِEa Anim",
        styleAccessories: "اكسسوارات الاناقة - enim ea id fugiat anim ad.",
        pressedState: "نمط الحالة المضغوطة - fugiat anim",
      },
      disabling: {
        name: "تعطيل",
        description: "يمكن تعطيل المكون، وتصميمه بناء على ذلك. سيتم تعطيل سلوك الضغط",
        standard: "إبطال - معيار",
        filled: "إبطال - مملوء",
        reversed: "إبطال- معكوس",
        accessory: "نمط الملحق المعطل",
        textStyle: "نمط النص المعطل",
      },
    },
  },
  demoListItem: {
    description: "مكون صف مصمم يمكن استخدامه في FlatList او SectionList او بمفرده",
    useCase: {
      height: {
        name: "علو",
        description: "يمكن ان يكون الصف بارتفاعات مختلفة",
        defaultHeight: "الارتفاع الافتراضي (56px)",
        customHeight: "ارتفاع مخصص عبر دعامة 'height'",
        textHeight:
          "الارتفاع يتم تحديده من خلال محتوى النص - Reprehenderit incididunt deserunt do do ea labore.",
        longText: "تحديد النص إلى سطر واحد - Reprehenderit incididunt deserunt do do ea labore.",
      },
      separators: {
        name: "الفواصل",
        description: "الفاصل/ المقسم مهيّأ مسبقاً وهو اختياري",
        topSeparator: "فقط فاصل علوي",
        topAndBottomSeparator: "الفواصل العلوية والسفلية",
        bottomSeparator: "فقط فاصل سفلي",
      },
      icons: {
        name: "الأيقونات",
        description: "يمكنك تخصيص الرموز على اليسار أو اليمين",
        leftIcon: "أيقونة اليسار",
        rightIcon: "أيقونة اليمين",
        leftRightIcons: "أيقونة اليمين واليسار",
      },
      customLeftRight: {
        name: "مكونات مخصصة لليسار /اليمين",
        description: "اذا كنت بحاجة إلى مخصص لليسار/اليمين فيمكنك تمريره",
        customLeft: "مكون يسار مخصص",
        customRight: "مكون يمين مخصص",
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى",
        text: "عبر دعامة 'text' - reprehenderit sint",
        children: "أولاد- mostrud mollit",
        nestedChildren1: "الأولاد المتداخلون - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
      },
      listIntegration: {
        name: "دمج مع/ FlatList & FlashList",
        description: "يمكن دمج المكون بسهولة مع واجهة القائمة المفضلة لديك",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة.",
        styledText: "نص مصمم",
        styledContainer: "حاوية مصممة (فواصل)",
        tintedIcons: "أيقونات ملونة",
      },
    },
  },
  demoCard: {
    description:
      "البطاقات مفيدة لعرض المعلومات ذات الصلة بطريقة محددة. اذا كان ListItem يعرض المحتوى أفقياً، فيمكن استخدام البطاقة لعرض المحتوى رأسياً.",
    useCase: {
      presets: {
        name: "الإعدادات المسبقة",
        description: "هناك عدد قليل من الإعدادات المسبقة التي تم تكوينها مسبقاً",
        default: {
          heading: "الأعداد المسبق الافتراضي ( تقصير)",
          content: "Incididunt magna ut aliquip consectetur mollit dolor.",
          footer: "Consectetur nulla non aliquip velit.",
        },
        reversed: {
          heading: "الأعداد المسبق المعكوس",
          content: "Reprehenderit occaecat proident amet id laboris.",
          footer: "Consectetur tempor ea non labore anim .",
        },
      },
      verticalAlignment: {
        name: "انحياز عمودي",
        description:
          "اعتمادا على ما هو مطلوب، تأتي البطاقة مهيأة مسبقاً باستراتيجيات محاذاة مختلفة",
        top: {
          heading: "قمة (تقصير)",
          content: "يتم محاذاة كل محتوى تلقائياً إلى الأعلى",
          footer: "حتى التذييل",
        },
        center: {
          heading: "مركز",
          content: "يتم تركيز المحتوى بالنسبة لارتفاع البطاقة",
          footer: "أنا ايضاً!",
        },
        spaceBetween: {
          heading: "مسافة بين الكلمات",
          content: "يتم توزيع جميع المحتويات بالتساوي",
          footer: "أنا حيث أريد ان أكون",
        },
        reversed: {
          heading: "Force Footer Bottom",
          content: "يؤدي هذا إلى دفع التذييل إلى المكان الذي ينتمي اليه.",
          footer: "أنا وحد جداًهنا",
        },
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى.",
        heading: "عبر دعم 'heading'",
        content: "عبر دعم 'content'",
        footer: "أنا وحيد هنا.",
      },
      customComponent: {
        name: "مكونات مخصصة",
        description:
          "يمكن استبدال اي من المكونات المعدة مسبقاً بمكوناتك الخاصة. يمكنك ايضاً اضافة مكونات إضافية.",
        rightComponent: "RightComponent",
        leftComponent: "LeftComponent",
      },
      style: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة.",
        heading: "صمم العنوان",
        content: "صمم المحتوى",
        footer: "صمم التذييل",
      },
    },
  },
  demoAutoImage: {
    description: "مكون صورة يحدد حجم الصورة البعيدة او صورة data-uri",
    useCase: {
      remoteUri: {
        name: "عن بعد URI",
      },
      base64Uri: {
        name: "Base64 URI",
      },
      scaledToFitDimensions: {
        name: "تم قياسها لتناسب الأبعاد",
        description:
          " توفيرعرض  'maxWidth' و\\او 'maxHeight' ، سيتم عرض الصورة بنسبة عرض الى ارتفاع. كيف يختلف هذا عن 'resizeMode': 'contain'? اولاً،يمكنك تحديد حجم جانب واحد فقط. (ليس كلاهما). ثانياً، سيتم تغيير الصورة لتناسب الأبعاد المطلوبة بدلاً من مجرد احتوائها داخل حاوية الصورة الخاصة بها.",
        heightAuto: " عرض : ٦٠ / طول:  auto",
        widthAuto: "عرض: auto / طول: ٣٢",
        bothManual: "عرض :٦٠ / طول : ٦٠",
      },
    },
  },
  demoText: {
    description:
      "لتلبية احتياجاتك في عرض النصوص. هذا المكون عبارة عن HOC فوق المكون المدمج Native React.",
    useCase: {
      presets: {
        name: "الإعدادات المسبقة",
        description: "هناك عدد قليل من الإعدادات المسبقة التي تم تكوينها مسبقاً.",
        default:
          "الأعداد المسبق الافتراضي - Cillum eu laboris in labore. Excepteur mollit tempor reprehenderit fugiat elit et eu consequat laborum.",
        bold: "bold preset - Tempor et ullamco cupidatat in officia. Nulla ea duis elit id sunt ipsum cillum duis deserunt nostrud ut nostrud id.",
        subheading: "subheading preset - In Cupidatat Cillum.",
        heading: "heading preset - Voluptate Adipis.",
      },
      sizes: {
        name: "قياسات",
        description: "هناك حجم الدعامة",
        xs: "xs - Ea ipsum est ea ex sunt.",
        sm: "sm - Lorem sunt adipisicin.",
        md: "md - Consequat id do lorem.",
        lg: "lg - Nostrud ipsum ea.",
        xl: "xl - Eiusmod ex excepteur.",
        xxl: "xxl - Cillum eu laboris.",
      },
      weights: {
        name: "أوزان",
        description: "هناك وزن الدعامة",
        light:
          "light - Nulla magna incididunt excepteur est occaecat duis culpa dolore cupidatat enim et.",
        normal:
          "normal - Magna incididunt dolor ut veniam veniam laboris aliqua velit ea incididunt.",
        medium: "medium - Non duis laborum quis laboris occaecat culpa cillum.",
        semibold: "semiBold - Exercitation magna nostrud pariatur laborum occaecat aliqua.",
        bold: "bold - Eiusmod ullamco magna exercitation est excepteur.",
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى.",
        viaText:
          "via `text` prop - Billum in aute fugiat proident nisi pariatur est. Cupidatat anim cillum eiusmod ad. Officia eu magna aliquip labore dolore consequat.",
        viaTx: "عبر دعامة 'tx'",
        children: "childrenreprehenderit eu qui amet veniam consectetur.",
        nestedChildren: "الأطفال المتداخلون",
        nestedChildren2: "Occaecat aliqua irure proident veniam.",
        nestedChildren3: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren4: "Occaecat aliqua irure proident veniam.",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة.",
        text: "Consequat ullamco veniam velit mollit proident excepteur aliquip id culpa ipsum velit sint nostrud.",
        text2:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
        text3:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
      },
    },
  },
  demoHeader: {
    description: "المكون الذي يظهر على العديد من الشاشات، سيحمل ازرار التنقل وعنوان الشاشة.",
    useCase: {
      actionIcons: {
        name: "أيقونة الإجرائات ",
        description: "يمكنك بسهولة تمرير الرموزالى مكونات الاجراء اليسرى او اليمنى.",
        leftIconTitle: "الرمز الأيسر",
        rightIconTitle: "الرمز الأيمن ",
        bothIconsTitle: "كلا الرمزين",
      },
      actionText: {
        name: "نص العمل",
        description: "يمكنك بسهولة تمرير النص الى مكونات الاجراء اليسرى او اليمنى.",
        leftTxTitle: "عبر 'leftTx' ",
        rightTextTitle: "عبر `rightText`",
      },
      customActionComponents: {
        name: "مكونات الاجراء المخصص",
        description:
          "اذا لم تكن خيارات الرمز او النسكافية، فيمكنك تمرير مكون الاجراء المخصص الخاص بك.",
        customLeftActionTitle: "عمل يسار مخصص ",
      },
      titleModes: {
        name: "اوضاع العنوان",
        description:
          "يمكن اجبار العنوان على البقاء غي المنتصف ولكن قد يتم قطعه اذا كان طويلاً للغاية. يمكنك بشكل اختياري تعديله وفقاً لأزرار الإجراء.",
        centeredTitle: "عنوان مركزي",
        flexTitle: "عنوان مرن",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة",
        styledTitle: "عنوان مصمم",
        styledWrapperTitle: "غلاف مصمم",
        tintedIconsTitle: "أيقونات ملونة",
      },
    },
  },
  demoEmptyState: {
    description:
      "مكون يتم استخدامه عندما لا يكون هناك بيانات لعرضها. ويمكن استخدامه لتوجيه المستخدم الى ما يجب فعله بعد ذلك.",
    useCase: {
      presets: {
        name: "الإعدادات المسبقة",
        description:
          "يمكن إنشاء نص/صورة مختلفة مجموعات. واحد محدد مسبقاً يسمى 'generic'. لاحظ انه لا يوجد اي خيار افتراضي في حال رغبتك في الحصول على كامل  EmptyState مخصصة.",
      },
      passingContent: {
        name: "محتوى عابر",
        description: "هناك عدة طرق مختلفة لتمرير المحتوى.",
        customizeImageHeading: "تخصيص الصورة",
        customizeImageContent: "يمكنك تمرير اي مصدر للصورة",
        viaHeadingProp: "عبر دعامة 'heading'",
        viaContentProp: "عبر دعامة 'content'",
        viaButtonProp: "عبر دعامة 'button'",
      },
      styling: {
        name: "التصميم",
        description: "يمكن تصميم المكون بسهولة.",
      },
    },
  },
}

export default demoAr

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/demo-fr.ts

import { DemoTranslations } from "./demo-en"

export const demoFr: DemoTranslations = {
  demoIcon: {
    description:
      "Un composant pour faire le rendu d’une icône enregistrée. Il est enveloppé dans un <TouchableOpacity /> si `onPress` est fourni, sinon dans une <View />.",
    useCase: {
      icons: {
        name: "Icônes",
        description: "Liste des icônes enregistrées dans le composant.",
      },
      size: {
        name: "Taille",
        description: "Il y a une prop de taille.",
      },
      color: {
        name: "Couleur",
        description: "Il y a une prop de couleur.",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
      },
    },
  },
  demoTextField: {
    description: "Le composant <TextField /> permet la saisie et l'édition de texte.",
    useCase: {
      statuses: {
        name: "Statuts",
        description:
          "Il y a une prop de statut - similaire à `preset` dans d'autres composants, mais affecte également la fonctionnalité du composant.",
        noStatus: {
          label: "Pas de statut",
          helper: "C'est le statut par défaut",
          placeholder: "Le texte passe par là",
        },
        error: {
          label: "Statut d'erreur",
          helper: "Statut à utiliser en cas d’erreur",
          placeholder: "Le texte passe par ici",
        },
        disabled: {
          label: "Statut désactivé",
          helper: "Désactive l’édition et atténue le texte",
          placeholder: "Le texte repasse par là",
        },
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transmettre du contenu.",
        viaLabel: {
          labelTx: "Via la prop `label`",
          helper: "Via la prop `helper`",
          placeholder: "Via la prop `placeholder`",
        },
        rightAccessory: {
          label: "Accessoire droit",
          helper: "Cette prop demande une fonction qui retourne un élément React.",
        },
        leftAccessory: {
          label: "Accessoire gauche",
          helper: "Cette prop demande une fonction qui retourne un élément React.",
        },
        supportsMultiline: {
          label: "Supporte le multiligne",
          helper: "Permet une saisie plus longue pour le texte multiligne.",
        },
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        styleInput: {
          label: "Style de saisie",
          helper: "Via la prop `style`",
        },
        styleInputWrapper: {
          label: "Style du wrapper de saisie",
          helper: "Via la prop `inputWrapperStyle`",
        },
        styleContainer: {
          label: "Style du conteneur",
          helper: "Via la prop `containerStyle`",
        },
        styleLabel: {
          label: "Style du label et de l’aide",
          helper: "Via les props de style `LabelTextProps` et `HelperTextProps`",
        },
        styleAccessories: {
          label: "Style des accessoires",
          helper: "Via les props de style `RightAccessory` et `LeftAccessory`",
        },
      },
    },
  },
  demoToggle: {
    description:
      "Fait le rendu d’un booléen. Ce composant contrôlé nécessite un callback `onValueChange` qui met à jour la prop `value` pour que le composant reflète les actions de l'utilisateur. Si la prop `value` n'est pas mise à jour, le composant continuera à rendre la prop `value` fournie au lieu du résultat attendu des actions de l'utilisateur.",
    useCase: {
      variants: {
        name: "Variantes",
        description:
          "Le composant supporte différentes variantes. Si une personnalisation poussée d'une variante spécifique est nécessaire, elle peut être facilement refactorisée. La valeur par défaut est `checkbox`.",
        checkbox: {
          label: "Variante `checkbox`",
          helper: "Peut être utilisée pour une seule valeure on/off.",
        },
        radio: {
          label: "Variante `radio`",
          helper: "Utilisez ceci quand vous avez plusieurs options.",
        },
        switch: {
          label: "Variante `switch`",
          helper:
            "Une entrée on/off plus proéminente. Possède un meilleur support d’accessibilité.",
        },
      },
      statuses: {
        name: "Statuts",
        description:
          "Il y a une prop de statut - similaire à `preset` dans d'autres composants, mais affecte également la fonctionnalité du composant.",
        noStatus: "Pas de statut - c'est le défaut",
        errorStatus: "Statut d’erreur - à utiliser quand il y a une erreur",
        disabledStatus: "Statut désactivé - désactive l’édition et atténue le style",
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transmettre du contenu.",
        useCase: {
          checkBox: {
            label: "Via la prop `labelTx`",
            helper: "Via la prop `helperTx`.",
          },
          checkBoxMultiLine: {
            helper: "Supporte le multiligne - Nulla proident consectetur labore sunt ea labore. ",
          },
          radioChangeSides: {
            helper:
              "Vous pouvez changer de côté - Laborum labore adipisicing in eu ipsum deserunt.",
          },
          customCheckBox: {
            label: "Passez une icône de case à cocher personnalisée.",
          },
          switch: {
            label: "Les interrupteurs peuvent être lus comme du texte",
            helper:
              "Par défaut, cette option n’utilise pas `Text` car selon la police, les caractères on/off pourraient paraître étranges. Personnalisez selon vos besoins.",
          },
          switchAid: {
            label: "Ou aidé d’une icône",
          },
        },
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        outerWrapper: "1 - styliser le wrapper extérieur de l’entrée",
        innerWrapper: "2 - styliser le wrapper intérieur de l’entrée",
        inputDetail: "3 - styliser le détail de l’entrée",
        labelTx: "Vous pouvez aussi styliser le labelTx",
        styleContainer: "Ou, styliser le conteneur entier",
      },
    },
  },
  demoButton: {
    description:
      "Un composant qui permet aux utilisateurs d’effectuer des actions et de faire des choix. Enveloppe le composant Text avec un composant Pressable.",
    useCase: {
      presets: {
        name: "Préréglages",
        description: "Il y a quelques préréglages préconfigurés.",
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transmettre du contenu.",
        viaTextProps: "Via la prop `text` - Billum In",
        children: "Enfants - Irure Reprehenderit",
        rightAccessory: "Accessoire droit - Duis Quis",
        leftAccessory: "Accessoire gauche - Duis Proident",
        nestedChildren: "Enfants imbriqués - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren3: "Occaecat aliqua irure proident veniam.",
        multiLine:
          "Multiligne - consequat veniam veniam reprehenderit. Fugiat id nisi quis duis sunt proident mollit dolor mollit adipisicing proident deserunt.",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        styleContainer: "Style du conteneur - Exercitation",
        styleText: "Style du texte - Ea Anim",
        styleAccessories: "Style des accessoires - enim ea id fugiat anim ad.",
        pressedState: "Style de l’état pressé - fugiat anim",
      },
      disabling: {
        name: "Désactivation",
        description:
          "Le composant peut être désactivé et stylisé en conséquence. Le comportement de pression sera désactivé.",
        standard: "Désactivé - standard",
        filled: "Désactivé - rempli",
        reversed: "Désactivé - inversé",
        accessory: "Style d’accessoire désactivé",
        textStyle: "Style de texte désactivé",
      },
    },
  },
  demoListItem: {
    description:
      "Un composant de ligne stylisé qui peut être utilisé dans FlatList, SectionList, ou seul.",
    useCase: {
      height: {
        name: "Hauteur",
        description: "La ligne peut avoir différentes hauteurs.",
        defaultHeight: "Hauteur par défaut (56px)",
        customHeight: "Hauteur personnalisée via la prop `height`",
        textHeight:
          "Hauteur déterminée par le contenu du texte - Reprehenderit incididunt deserunt do do ea labore.",
        longText:
          "Limiter le texte long à une ligne - Reprehenderit incididunt deserunt do do ea labore.",
      },
      separators: {
        name: "Séparateurs",
        description: "Le séparateur / diviseur est préconfiguré et optionnel.",
        topSeparator: "Séparateur uniquement en haut",
        topAndBottomSeparator: "Séparateurs en haut et en bas",
        bottomSeparator: "Séparateur uniquement en bas",
      },
      icons: {
        name: "Icônes",
        description: "Vous pouvez personnaliser les icônes à gauche ou à droite.",
        leftIcon: "Icône gauche",
        rightIcon: "Icône droite",
        leftRightIcons: "Icônes gauche et droite",
      },
      customLeftRight: {
        name: "Composants personnalisés gauche/droite",
        description:
          "Si vous avez besoin d’un composant personnalisé à gauche/droite, vous pouvez le passer.",
        customLeft: "Composant personnalisé à gauche",
        customRight: "Composant personnalisé à droite",
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transmettre du contenu.",
        text: "Via la prop `text` - reprehenderit sint",
        children: "Enfants - mostrud mollit",
        nestedChildren1: "Enfants imbriqués - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
      },
      listIntegration: {
        name: "Intégration avec FlatList & FlashList",
        description:
          "Le composant peut être facilement intégré avec votre interface de liste préférée.",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        styledText: "Texte stylisé",
        styledContainer: "Conteneur stylisé (séparateurs)",
        tintedIcons: "Icônes teintées",
      },
    },
  },
  demoCard: {
    description:
      "Les cartes sont utiles pour afficher des informations connexes de manière contenue. Si un ListItem affiche le contenu horizontalement, une Card peut être utilisée pour afficher le contenu verticalement.",
    useCase: {
      presets: {
        name: "Préréglages",
        description: "Il y a quelques préréglages préconfigurés.",
        default: {
          heading: "Préréglage par défaut (default)",
          content: "Incididunt magna ut aliquip consectetur mollit dolor.",
          footer: "Consectetur nulla non aliquip velit.",
        },
        reversed: {
          heading: "Préréglage inversé",
          content: "Reprehenderit occaecat proident amet id laboris.",
          footer: "Consectetur tempor ea non labore anim .",
        },
      },
      verticalAlignment: {
        name: "Alignement vertical",
        description:
          "Selon les besoins, la carte est préconfigurée avec différentes stratégies d’alignement.",
        top: {
          heading: "Haut (par défaut)",
          content: "Tout le contenu est automatiquement aligné en haut.",
          footer: "Même le pied de page",
        },
        center: {
          heading: "Centre",
          content: "Le contenu est centré par rapport à la hauteur de la carte.",
          footer: "Moi aussi !",
        },
        spaceBetween: {
          heading: "Espace entre",
          content: "Tout le contenu est espacé uniformément.",
          footer: "Je suis là où je veux être.",
        },
        reversed: {
          heading: "Forcer le pied de page en bas",
          content: "Cela pousse le pied de page là où il appartient.",
          footer: "Je suis si seul ici en bas.",
        },
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transmettre du contenu.",
        heading: "Via la prop `heading`",
        content: "Via la prop `content`",
        footer: "Je suis si seul ici en bas.",
      },
      customComponent: {
        name: "Composants personnalisés",
        description:
          "N’importe quels composants préconfigurés peuvent être remplacé par le vôtre. Vous pouvez également en ajouter d’autres.",
        rightComponent: "Composant droit",
        leftComponent: "Composant gauche",
      },
      style: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        heading: "Styliser l’en-tête",
        content: "Styliser le contenu",
        footer: "Styliser le pied de page",
      },
    },
  },
  demoAutoImage: {
    description:
      "Un composant Image qui dimensionne automatiquement une image distante ou data-uri.",
    useCase: {
      remoteUri: { name: "URI distante" },
      base64Uri: { name: "URI Base64" },
      scaledToFitDimensions: {
        name: "Mis à l’échelle pour s’adapter aux dimensions",
        description:
          "En fournissant les props `maxWidth` et/ou `maxHeight`, l’image se redimensionnera automatiquement à l’échelle tout en conservant son rapport d’aspect. En quoi est-ce différent de `resizeMode: 'contain'` ? Premièrement, vous pouvez spécifier la taille d'un seul côté (pas les deux). Deuxièmement, l'image s'adaptera aux dimensions souhaitées au lieu d'être simplement contenue dans son conteneur d'image.",
        heightAuto: "largeur: 60 / hauteur: auto",
        widthAuto: "largeur: auto / hauteur: 32",
        bothManual: "largeur: 60 / hauteur: 60",
      },
    },
  },
  demoText: {
    description:
      "Pour vos besoins d'affichage de texte. Ce composant est un HOC sur celui intégré à React Native.",
    useCase: {
      presets: {
        name: "Préréglages",
        description: "Il y a quelques réglages préconfigurés.",
        default:
          "préréglage par défaut - Cillum eu laboris in labore. Excepteur mollit tempor reprehenderit fugiat elit et eu consequat laborum.",
        bold: "préréglage gras - Tempor et ullamco cupidatat in officia. Nulla ea duis elit id sunt ipsum cillum duis deserunt nostrud ut nostrud id.",
        subheading: "préréglage sous-titre - In Cupidatat Cillum.",
        heading: "préréglage titre - Voluptate Adipis.",
      },
      sizes: {
        name: "Tailles",
        description: "Il y a une prop de taille.",
        xs: "xs - Ea ipsum est ea ex sunt.",
        sm: "sm - Lorem sunt adipisicin.",
        md: "md - Consequat id do lorem.",
        lg: "lg - Nostrud ipsum ea.",
        xl: "xl - Eiusmod ex excepteur.",
        xxl: "xxl - Cillum eu laboris.",
      },
      weights: {
        name: "Graisse",
        description: "Il y a une prop de graisse.",
        light:
          "léger - Nulla magna incididunt excepteur est occaecat duis culpa dolore cupidatat enim et.",
        normal:
          "normal - Magna incididunt dolor ut veniam veniam laboris aliqua velit ea incididunt.",
        medium: "moyen - Non duis laborum quis laboris occaecat culpa cillum.",
        semibold: "demi-gras - Exercitation magna nostrud pariatur laborum occaecat aliqua.",
        bold: "gras - Eiusmod ullamco magna exercitation est excepteur.",
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transférer du contenu.",
        viaText:
          "via la prop `text` - Billum in aute fugiat proident nisi pariatur est. Cupidatat anim cillum eiusmod ad. Officia eu magna aliquip labore dolore consequat.",
        viaTx: "via la prop `tx` -",
        children: "enfants - Aliqua velit irure reprehenderit eu qui amet veniam consectetur.",
        nestedChildren: "Enfants imbriqués -",
        nestedChildren2: "Occaecat aliqua irure proident veniam.",
        nestedChildren3: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren4: "Occaecat aliqua irure proident veniam.",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        text: "Consequat ullamco veniam velit mollit proident excepteur aliquip id culpa ipsum velit sint nostrud.",
        text2:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
        text3:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
      },
    },
  },
  demoHeader: {
    description:
      "Composant qui apparaît sur de nombreux écrans. Contiendra les boutons de navigation et le titre de l’écran.",
    useCase: {
      actionIcons: {
        name: "Icônes d’action",
        description:
          "Vous pouvez facilement passer des icônes aux composants d’action gauche ou droit.",
        leftIconTitle: "Icône gauche",
        rightIconTitle: "Icône droite",
        bothIconsTitle: "Les deux icônes",
      },
      actionText: {
        name: "Texte d’action",
        description:
          "Vous pouvez facilement passer du texte aux composants d’action gauche ou droit.",
        leftTxTitle: "Via `leftTx`",
        rightTextTitle: "Via `rightText`",
      },
      customActionComponents: {
        name: "Composants d’action personnalisés",
        description:
          "Si les options d’icône ou de texte ne suffisent pas, vous pouvez passer votre propre composant d’action personnalisé.",
        customLeftActionTitle: "Action gauche personnalisée",
      },
      titleModes: {
        name: "Modes de titre",
        description:
          "Le titre peut être forcé à rester au centre (par défaut) mais peut être coupé s’il est trop long. Vous pouvez éventuellement le faire s’ajuster aux boutons d’action.",
        centeredTitle: "Titre centré",
        flexTitle: "Titre flexible",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
        styledTitle: "Titre stylisé",
        styledWrapperTitle: "Wrapper stylisé",
        tintedIconsTitle: "Icônes teintées",
      },
    },
  },
  demoEmptyState: {
    description:
      "Un composant à utiliser lorsqu’il n’y a pas de données à afficher. Il peut être utilisé pour diriger l’utilisateur sur ce qu’il faut faire ensuite.",
    useCase: {
      presets: {
        name: "Préréglages",
        description:
          "Vous pouvez créer différents ensembles de texte/image. Un est prédéfini appelé `generic`. Notez qu’il n’y a pas de valeur par défaut au cas où vous voudriez avoir un EmptyState complètement personnalisé.",
      },
      passingContent: {
        name: "Transfert de contenu",
        description: "Il y a plusieurs façons de transférer du contenu.",
        customizeImageHeading: "Personnaliser l’image",
        customizeImageContent: "Vous pouvez passer n’importe quelle source d'image.",
        viaHeadingProp: "Via la prop `heading`",
        viaContentProp: "Via la prop `content`.",
        viaButtonProp: "Via la prop `button`",
      },
      styling: {
        name: "Style",
        description: "Le composant peut être facilement stylisé.",
      },
    },
  },
}

export default demoFr

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/demo-en.ts

export const demoEn = {
  demoIcon: {
    description:
      "A component to render a registered icon. It is wrapped in a <TouchableOpacity /> if `onPress` is provided, otherwise a <View />.",
    useCase: {
      icons: {
        name: "Icons",
        description: "List of icons registered inside the component.",
      },
      size: {
        name: "Size",
        description: "There's a size prop.",
      },
      color: {
        name: "Color",
        description: "There's a color prop.",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
      },
    },
  },
  demoTextField: {
    description: "TextField component allows for the entering and editing of text.",
    useCase: {
      statuses: {
        name: "Statuses",
        description:
          "There is a status prop - similar to `preset` in other components, but affects component functionality as well.",
        noStatus: {
          label: "No Status",
          helper: "This is the default status",
          placeholder: "Text goes here",
        },
        error: {
          label: "Error Status",
          helper: "Status to use when there is an error",
          placeholder: "Text goes here",
        },
        disabled: {
          label: "Disabled Status",
          helper: "Disables the editability and mutes text",
          placeholder: "Text goes here",
        },
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        viaLabel: {
          labelTx: "Via `label` prop",
          helper: "Via `helper` prop",
          placeholder: "Via `placeholder` prop",
        },
        rightAccessory: {
          label: "RightAccessory",
          helper: "This prop takes a function that returns a React element.",
        },
        leftAccessory: {
          label: "LeftAccessory",
          helper: "This prop takes a function that returns a React element.",
        },
        supportsMultiline: {
          label: "Supports Multiline",
          helper: "Enables a taller input for multiline text.",
        },
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        styleInput: {
          label: "Style Input",
          helper: "Via `style` prop",
        },
        styleInputWrapper: {
          label: "Style Input Wrapper",
          helper: "Via `inputWrapperStyle` prop",
        },
        styleContainer: {
          label: "Style Container",
          helper: "Via `containerStyle` prop",
        },
        styleLabel: {
          label: "Style Label & Helper",
          helper: "Via `LabelTextProps` & `HelperTextProps` style prop",
        },
        styleAccessories: {
          label: "Style Accessories",
          helper: "Via `RightAccessory` & `LeftAccessory` style prop",
        },
      },
    },
  },
  demoToggle: {
    description:
      "Renders a boolean input. This is a controlled component that requires an onValueChange callback that updates the value prop in order for the component to reflect user actions. If the value prop is not updated, the component will continue to render the supplied value prop instead of the expected result of any user actions.",
    useCase: {
      variants: {
        name: "Variants",
        description:
          "The component supports a few different variants. If heavy customization of a specific variant is needed, it can be easily refactored. The default is `checkbox`.",
        checkbox: {
          label: "`checkbox` variant",
          helper: "This can be used for a single on/off input.",
        },
        radio: {
          label: "`radio` variant",
          helper: "Use this when you have multiple options.",
        },
        switch: {
          label: "`switch` variant",
          helper: "A more prominent on/off input. Has better accessibility support.",
        },
      },
      statuses: {
        name: "Statuses",
        description:
          "There is a status prop - similar to `preset` in other components, but affects component functionality as well.",
        noStatus: "No status - this is the default",
        errorStatus: "Error status - use when there is an error",
        disabledStatus: "Disabled status - disables the editability and mutes input",
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        useCase: {
          checkBox: {
            label: "Via `labelTx` prop",
            helper: "Via `helperTx` prop.",
          },
          checkBoxMultiLine: {
            helper: "Supports multiline - Nulla proident consectetur labore sunt ea labore. ",
          },
          radioChangeSides: {
            helper: "You can change sides - Laborum labore adipisicing in eu ipsum deserunt.",
          },
          customCheckBox: {
            label: "Pass in a custom checkbox icon.",
          },
          switch: {
            label: "Switches can be read as text",
            helper:
              "By default, this option doesn't use `Text` since depending on the font, the on/off characters might look weird. Customize as needed.",
          },
          switchAid: {
            label: "Or aided with an icon",
          },
        },
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        outerWrapper: "1 - style the input outer wrapper",
        innerWrapper: "2 - style the input inner wrapper",
        inputDetail: "3 - style the input detail",
        labelTx: "You can also style the labelTx",
        styleContainer: "Or, style the entire container",
      },
    },
  },
  demoButton: {
    description:
      "A component that allows users to take actions and make choices. Wraps the Text component with a Pressable component.",
    useCase: {
      presets: {
        name: "Presets",
        description: "There are a few presets that are preconfigured.",
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        viaTextProps: "Via `text` Prop - Billum In",
        children: "Children - Irure Reprehenderit",
        rightAccessory: "RightAccessory - Duis Quis",
        leftAccessory: "LeftAccessory - Duis Proident",
        nestedChildren: "Nested children - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren3: "Occaecat aliqua irure proident veniam.",
        multiLine:
          "Multiline - consequat veniam veniam reprehenderit. Fugiat id nisi quis duis sunt proident mollit dolor mollit adipisicing proident deserunt.",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        styleContainer: "Style Container - Exercitation",
        styleText: "Style Text - Ea Anim",
        styleAccessories: "Style Accessories - enim ea id fugiat anim ad.",
        pressedState: "Style Pressed State - fugiat anim",
      },
      disabling: {
        name: "Disabling",
        description:
          "The component can be disabled, and styled based on that. Press behavior will be disabled.",
        standard: "Disabled - standard",
        filled: "Disabled - filled",
        reversed: "Disabled - reversed",
        accessory: "Disabled accessory style",
        textStyle: "Disabled text style",
      },
    },
  },
  demoListItem: {
    description: "A styled row component that can be used in FlatList, SectionList, or by itself.",
    useCase: {
      height: {
        name: "Height",
        description: "The row can be different heights.",
        defaultHeight: "Default height (56px)",
        customHeight: "Custom height via `height` prop",
        textHeight:
          "Height determined by text content - Reprehenderit incididunt deserunt do do ea labore.",
        longText:
          "Limit long text to one line - Reprehenderit incididunt deserunt do do ea labore.",
      },
      separators: {
        name: "Separators",
        description: "The separator / divider is preconfigured and optional.",
        topSeparator: "Only top separator",
        topAndBottomSeparator: "Top and bottom separators",
        bottomSeparator: "Only bottom separator",
      },
      icons: {
        name: "Icons",
        description: "You can customize the icons on the left or right.",
        leftIcon: "Left icon",
        rightIcon: "Right Icon",
        leftRightIcons: "Left & Right Icons",
      },
      customLeftRight: {
        name: "Custom Left/Right Components",
        description: "If you need a custom left/right component, you can pass it in.",
        customLeft: "Custom left component",
        customRight: "Custom right component",
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        text: "Via `text` prop - reprehenderit sint",
        children: "Children - mostrud mollit",
        nestedChildren1: "Nested children - proident veniam.",
        nestedChildren2: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
      },
      listIntegration: {
        name: "Integrating w/ FlatList & FlashList",
        description: "The component can be easily integrated with your favorite list interface.",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        styledText: "Styled Text",
        styledContainer: "Styled Container (separators)",
        tintedIcons: "Tinted Icons",
      },
    },
  },
  demoCard: {
    description:
      "Cards are useful for displaying related information in a contained way. If a ListItem displays content horizontally, a Card can be used to display content vertically.",
    useCase: {
      presets: {
        name: "Presets",
        description: "There are a few presets that are preconfigured.",
        default: {
          heading: "Default Preset (default)",
          content: "Incididunt magna ut aliquip consectetur mollit dolor.",
          footer: "Consectetur nulla non aliquip velit.",
        },
        reversed: {
          heading: "Reversed Preset",
          content: "Reprehenderit occaecat proident amet id laboris.",
          footer: "Consectetur tempor ea non labore anim .",
        },
      },
      verticalAlignment: {
        name: "Vertical Alignment",
        description:
          "Depending on what's required, the card comes preconfigured with different alignment strategies.",
        top: {
          heading: "Top (default)",
          content: "All content is automatically aligned to the top.",
          footer: "Even the footer",
        },
        center: {
          heading: "Center",
          content: "Content is centered relative to the card's height.",
          footer: "Me too!",
        },
        spaceBetween: {
          heading: "Space Between",
          content: "All content is spaced out evenly.",
          footer: "I am where I want to be.",
        },
        reversed: {
          heading: "Force Footer Bottom",
          content: "This pushes the footer where it belongs.",
          footer: "I'm so lonely down here.",
        },
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        heading: "Via `heading` Prop",
        content: "Via `content` Prop",
        footer: "I'm so lonely down here.",
      },
      customComponent: {
        name: "Custom Components",
        description:
          "Any of the preconfigured components can be replaced with your own. You can also add additional ones.",
        rightComponent: "RightComponent",
        leftComponent: "LeftComponent",
      },
      style: {
        name: "Styling",
        description: "The component can be styled easily.",
        heading: "Style the Heading",
        content: "Style the Content",
        footer: "Style the Footer",
      },
    },
  },
  demoAutoImage: {
    description: "An Image component that automatically sizes a remote or data-uri image.",
    useCase: {
      remoteUri: { name: "Remote URI" },
      base64Uri: { name: "Base64 URI" },
      scaledToFitDimensions: {
        name: "Scaled to Fit Dimensions",
        description:
          "Providing a `maxWidth` and/or `maxHeight` props, the image will automatically scale while retaining it's aspect ratio. How is this different from `resizeMode: 'contain'`? Firstly, you can specify only one side's size (not both). Secondly, the image will scale to fit the desired dimensions instead of just being contained within its image-container.",
        heightAuto: "width: 60 / height: auto",
        widthAuto: "width: auto / height: 32",
        bothManual: "width: 60 / height: 60",
      },
    },
  },
  demoText: {
    description:
      "For your text displaying needs. This component is a HOC over the built-in React Native one.",
    useCase: {
      presets: {
        name: "Presets",
        description: "There are a few presets that are preconfigured.",
        default:
          "default preset - Cillum eu laboris in labore. Excepteur mollit tempor reprehenderit fugiat elit et eu consequat laborum.",
        bold: "bold preset - Tempor et ullamco cupidatat in officia. Nulla ea duis elit id sunt ipsum cillum duis deserunt nostrud ut nostrud id.",
        subheading: "subheading preset - In Cupidatat Cillum.",
        heading: "heading preset - Voluptate Adipis.",
      },
      sizes: {
        name: "Sizes",
        description: "There's a size prop.",
        xs: "xs - Ea ipsum est ea ex sunt.",
        sm: "sm - Lorem sunt adipisicin.",
        md: "md - Consequat id do lorem.",
        lg: "lg - Nostrud ipsum ea.",
        xl: "xl - Eiusmod ex excepteur.",
        xxl: "xxl - Cillum eu laboris.",
      },
      weights: {
        name: "Weights",
        description: "There's a weight prop.",
        light:
          "light - Nulla magna incididunt excepteur est occaecat duis culpa dolore cupidatat enim et.",
        normal:
          "normal - Magna incididunt dolor ut veniam veniam laboris aliqua velit ea incididunt.",
        medium: "medium - Non duis laborum quis laboris occaecat culpa cillum.",
        semibold: "semiBold - Exercitation magna nostrud pariatur laborum occaecat aliqua.",
        bold: "bold - Eiusmod ullamco magna exercitation est excepteur.",
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        viaText:
          "via `text` prop - Billum in aute fugiat proident nisi pariatur est. Cupidatat anim cillum eiusmod ad. Officia eu magna aliquip labore dolore consequat.",
        viaTx: "via `tx` prop -",
        children: "children - Aliqua velit irure reprehenderit eu qui amet veniam consectetur.",
        nestedChildren: "Nested children -",
        nestedChildren2: "Occaecat aliqua irure proident veniam.",
        nestedChildren3: "Ullamco cupidatat officia exercitation velit non ullamco nisi..",
        nestedChildren4: "Occaecat aliqua irure proident veniam.",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        text: "Consequat ullamco veniam velit mollit proident excepteur aliquip id culpa ipsum velit sint nostrud.",
        text2:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
        text3:
          "Eiusmod occaecat laboris eu ex veniam ipsum adipisicing consectetur. Magna ullamco adipisicing tempor adipisicing.",
      },
    },
  },
  demoHeader: {
    description:
      "Component that appears on many screens. Will hold navigation buttons and screen title.",
    useCase: {
      actionIcons: {
        name: "Action Icons",
        description: "You can easily pass in icons to the left or right action components.",
        leftIconTitle: "Left Icon",
        rightIconTitle: "Right Icon",
        bothIconsTitle: "Both Icons",
      },
      actionText: {
        name: "Action Text",
        description: "You can easily pass in text to the left or right action components.",
        leftTxTitle: "Via `leftTx`",
        rightTextTitle: "Via `rightText`",
      },
      customActionComponents: {
        name: "Custom Action Components",
        description:
          "If the icon or text options are not enough, you can pass in your own custom action component.",
        customLeftActionTitle: "Custom Left Action",
      },
      titleModes: {
        name: "Title Modes",
        description:
          "Title can be forced to stay in center (default) but may be cut off if it's too long. You can optionally make it adjust to the action buttons.",
        centeredTitle: "Centered Title",
        flexTitle: "Flex Title",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
        styledTitle: "Styled Title",
        styledWrapperTitle: "Styled Wrapper",
        tintedIconsTitle: "Tinted Icons",
      },
    },
  },
  demoEmptyState: {
    description:
      "A component to use when there is no data to display. It can be utilized to direct the user what to do next",
    useCase: {
      presets: {
        name: "Presets",
        description:
          "You can create different text/image sets. One is predefined called `generic`. Note, there's no default in case you want to have a completely custom EmptyState.",
      },
      passingContent: {
        name: "Passing Content",
        description: "There are a few different ways to pass content.",
        customizeImageHeading: "Customize Image",
        customizeImageContent: "You can pass in any image source.",
        viaHeadingProp: "Via `heading` Prop",
        viaContentProp: "Via `content` prop.",
        viaButtonProp: "Via `button` Prop",
      },
      styling: {
        name: "Styling",
        description: "The component can be styled easily.",
      },
    },
  },
}

export default demoEn
export type DemoTranslations = typeof demoEn

// @demo remove-file

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/ko.ts

import demoKo from "./demo-ko"
import { Translations } from "./en"

const ko: Translations = {
  common: {
    ok: "확인!",
    cancel: "취소",
    back: "뒤로",
    logOut: "로그아웃", // @demo remove-current-line
  },
  welcomeScreen: {
    postscript:
      "잠깐! — 지금 보시는 것은 아마도 당신의 앱의 모양새가 아닐겁니다. (디자이너분이 이렇게 건내주셨다면 모를까요. 만약에 그렇다면, 이대로 가져갑시다!) ",
    readyForLaunch: "출시 준비가 거의 끝난 나만의 앱!",
    exciting: "(오, 이거 신나는데요!)",
    letsGo: "가보자구요!", // @demo remove-current-line
  },
  errorScreen: {
    title: "뭔가 잘못되었습니다!",
    friendlySubtitle:
      "이 화면은 오류가 발생할 때 프로덕션에서 사용자에게 표시됩니다. 이 메시지를 커스터마이징 할 수 있고(해당 파일은 `app/i18n/ko.ts` 에 있습니다) 레이아웃도 마찬가지로 수정할 수 있습니다(`app/screens/error`). 만약 이 오류화면을 완전히 없에버리고 싶다면 `app/app.tsx` 파일에서 <ErrorBoundary> 컴포넌트를 확인하기 바랍니다.",
    reset: "초기화",
    traceTitle: "%{name} 스택에서의 오류", // @demo remove-current-line
  },
  emptyStateComponent: {
    generic: {
      heading: "너무 텅 비어서.. 너무 슬퍼요..",
      content: "데이터가 없습니다. 버튼을 눌러서 리프레쉬 하시거나 앱을 리로드하세요.",
      button: "다시 시도해봅시다",
    },
  },
  // @demo remove-block-start
  errors: {
    invalidEmail: "잘못된 이메일 주소 입니다.",
  },
  loginScreen: {
    logIn: "로그인",
    enterDetails:
      "일급비밀 정보를 해제하기 위해 상세 정보를 입력하세요. 무엇이 기다리고 있는지 절대 모를겁니다. 혹은 알 수 있을지도 모르겠군요. 엄청 복잡한 뭔가는 아닙니다.",
    emailFieldLabel: "이메일",
    passwordFieldLabel: "비밀번호",
    emailFieldPlaceholder: "이메일을 입력하세요",
    passwordFieldPlaceholder: "엄청 비밀스러운 암호를 입력하세요",
    tapToLogIn: "눌러서 로그인 하기!",
    hint: "힌트: 가장 좋아하는 암호와 아무런 아무 이메일 주소나 사용할 수 있어요 :)",
  },
  demoNavigator: {
    componentsTab: "컴포넌트",
    debugTab: "디버그",
    communityTab: "커뮤니티",
    podcastListTab: "팟캐스트",
  },
  demoCommunityScreen: {
    title: "커뮤니티와 함께해요",
    tagLine:
      "전문적인 React Native 엔지니어들로 구성된 Infinite Red 커뮤니티에 접속해서 함께 개발 실력을 향상시켜 보세요!",
    joinUsOnSlackTitle: "Slack 에 참여하세요",
    joinUsOnSlack:
      "전 세계 React Native 엔지니어들과 함께할 수 있는 곳이 있었으면 좋겠죠? Infinite Red Community Slack 에서 대화에 참여하세요! 우리의 성장하는 커뮤니티는 질문을 던지고, 다른 사람들로부터 배우고, 네트워크를 확장할 수 있는 안전한 공간입니다. ",
    joinSlackLink: "Slack 에 참여하기",
    makeIgniteEvenBetterTitle: "Ignite 을 향상시켜요",
    makeIgniteEvenBetter:
      "Ignite 을 더 좋게 만들 아이디어가 있나요? 기쁜 소식이네요. 우리는 항상 최고의 React Native 도구를 구축하는데 도움을 줄 수 있는 분들을 찾고 있습니다. GitHub 에서 Ignite 의 미래를 만들어 가는것에 함께해 주세요.",
    contributeToIgniteLink: "Ignite 에 기여하기",
    theLatestInReactNativeTitle: "React Native 의 최신정보",
    theLatestInReactNative: "React Native 가 제공하는 모든 최신 정보를 알려드립니다.",
    reactNativeRadioLink: "React Native 라디오",
    reactNativeNewsletterLink: "React Native 뉴스레터",
    reactNativeLiveLink: "React Native 라이브 스트리밍",
    chainReactConferenceLink: "Chain React 컨퍼런스",
    hireUsTitle: "다음 프로젝트에 Infinite Red 를 고용하세요",
    hireUs:
      "프로젝트 전체를 수행하든, 실무 교육을 통해 팀의 개발 속도에 박차를 가하든 상관없이, Infinite Red 는 React Native 프로젝트의 모든 분야의 에서 도움을 드릴 수 있습니다.",
    hireUsLink: "메세지 보내기",
  },
  demoShowroomScreen: {
    jumpStart: "프로젝트를 바로 시작할 수 있는 컴포넌트들!",
    lorem2Sentences:
      "별 하나에 추억과, 별 하나에 사랑과, 별 하나에 쓸쓸함과, 별 하나에 동경(憧憬)과, 별 하나에 시와, 별 하나에 어머니, 어머니",
    demoHeaderTxExample: "야호",
    demoViaTxProp: "`tx` Prop 을 통해",
    demoViaSpecifiedTxProp: "`{{prop}}Tx` Prop 을 통해",
  },
  demoDebugScreen: {
    howTo: "사용방법",
    title: "디버그",
    tagLine:
      "축하합니다. 여기 아주 고급스러운 React Native 앱 템플릿이 있습니다. 이 보일러 플레이트를 사용해보세요!",
    reactotron: "Reactotron 으로 보내기",
    reportBugs: "버그 보고하기",
    demoList: "데모 목록",
    demoPodcastList: "데모 팟캐스트 목록",
    androidReactotronHint:
      "만약에 동작하지 않는 경우, Reactotron 데스크탑 앱이 실행중인지 확인 후, 터미널에서 adb reverse tcp:9090 tcp:9090 을 실행한 다음 앱을 다시 실행해보세요.",
    iosReactotronHint:
      "만약에 동작하지 않는 경우, Reactotron 데스크탑 앱이 실행중인지 확인 후 앱을 다시 실행해보세요.",
    macosReactotronHint:
      "만약에 동작하지 않는 경우, Reactotron 데스크탑 앱이 실행중인지 확인 후 앱을 다시 실행해보세요.",
    webReactotronHint:
      "만약에 동작하지 않는 경우, Reactotron 데스크탑 앱이 실행중인지 확인 후 앱을 다시 실행해보세요.",
    windowsReactotronHint:
      "만약에 동작하지 않는 경우, Reactotron 데스크탑 앱이 실행중인지 확인 후 앱을 다시 실행해보세요.",
  },
  demoPodcastListScreen: {
    title: "React Native 라디오 에피소드",
    onlyFavorites: "즐겨찾기만 보기",
    favoriteButton: "즐겨찾기",
    unfavoriteButton: "즐겨찾기 해제",
    accessibility: {
      cardHint:
        "에피소드를 들으려면 두 번 탭하세요. 이 에피소드를 좋아하거나 싫어하려면 두 번 탭하고 길게 누르세요.",
      switch: "즐겨찾기를 사용하려면 스위치를 사용하세요.",
      favoriteAction: "즐겨찾기 토글",
      favoriteIcon: "좋아하는 에피소드",
      unfavoriteIcon: "즐겨찾기하지 않은 에피소드",
      publishLabel: "{{date}} 에 발행됨",
      durationLabel: "소요시간: {{hours}}시간 {{minutes}}분 {{seconds}}초",
    },
    noFavoritesEmptyState: {
      heading: "조금 텅 비어 있네요.",
      content: "즐겨찾기가 없습니다. 에피소드에 있는 하트를 눌러서 즐겨찾기에 추가하세요.",
    },
  },
  // @demo remove-block-start
  ...demoKo,
  // @demo remove-block-end
}

export default ko

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/index.ts

import "./i18n"
export * from "./i18n"
export * from "./translate"

---

File: /Users/jks142857/Desktop/optionsTrading/reactBoilerPlate/boilerPlate/app/i18n/translate.ts

import { TranslateOptions } from "i18n-js"
import { i18n, TxKeyPath } from "./i18n"

/**
 * Translates text.
 * @param {TxKeyPath} key - The i18n key.
 * @param {i18n.TranslateOptions} options - The i18n options.
 * @returns {string} - The translated text.
 * @example
 * Translations:
 *
 * ```en.ts
 * {
 *  "hello": "Hello, {{name}}!"
 * }
 * ```
 *
 * Usage:
 * ```ts
 * import { translate } from "i18n-js"
 *
 * translate("common.ok", { name: "world" })
 * // => "Hello world!"
 * ```
 */
export function translate(key: TxKeyPath, options?: TranslateOptions): string {
  return i18n.t(key, options)
}

---


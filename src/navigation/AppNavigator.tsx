import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';

import AnalysisBoardScreen from '@screens/AnalysisBoardScreen';
import RepertoireScreen from '@screens/RepertoireScreen';
import GameListScreen from '@screens/GameListScreen';
import ImportPGNScreen from '@screens/ImportPGNScreen';
import RepertoireStudyScreen from '@screens/RepertoireStudyScreen';
import TrainingDashboardScreen from '@screens/training/TrainingDashboardScreen';
import TrainingSessionScreen from '@screens/training/TrainingSessionScreen';
import GameReviewDashboardScreen from '@screens/gameReview/GameReviewDashboardScreen';
import GameReviewScreen from '@screens/gameReview/GameReviewScreen';
import SettingsScreen from '@screens/SettingsScreen';
import DrawerContent from '@components/navigation/DrawerContent';

export type RootStackParamList = {
  Main: undefined;
  Analysis: undefined;
  Repertoire: undefined;
  Training: undefined;
  Games: undefined;
  GameReviewDashboard: undefined;
  Settings: undefined;
  Home?: undefined;
  ImportPGN: { target: 'repertoire' | 'my-games' | 'master-games' };
  RepertoireStudy: { repertoireId: string; chapterId: string };
  TrainingSession: {
    repertoireId: string;
    chapterId?: string;
    mode: 'depth-first' | 'width-first';
    maxDepth?: number;
    includeOnlyDueLines?: boolean;
  };
  GameReview: { gameId: string };
  RepertoireLibrary?: undefined;
  Library?: undefined;
  RepertoireViewer?: { repertoireId: string };
  Viewer?: { repertoireId?: string };
  ReviewSession?: { repertoireId: string };
};

const Drawer = createDrawerNavigator();
const Stack = createStackNavigator<RootStackParamList>();

function DrawerNavigator() {
  return (
    <Drawer.Navigator
      initialRouteName="Analysis"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerType: 'front',
        drawerStyle: { backgroundColor: '#1e1e1e', width: 280 },
        headerStyle: { backgroundColor: '#2c2c2c' },
        headerTintColor: '#e0e0e0',
        drawerActiveTintColor: '#007AFF',
        drawerInactiveTintColor: '#e0e0e0',
        drawerLabelStyle: { fontSize: 16 },
      }}
    >
      <Drawer.Screen
        name="Analysis"
        component={AnalysisBoardScreen}
        options={{ title: 'Analysis Board' }}
      />
      <Drawer.Screen
        name="Repertoire"
        component={RepertoireScreen}
        options={{ title: 'Repertoire' }}
      />
      <Drawer.Screen
        name="Training"
        component={TrainingDashboardScreen}
        options={{ title: 'Training' }}
      />
      <Drawer.Screen
        name="Games"
        component={GameListScreen}
        options={{ title: 'Game List' }}
      />
      <Drawer.Screen
        name="GameReviewDashboard"
        component={GameReviewDashboardScreen}
        options={{ title: 'Game Review' }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={DrawerNavigator} />
        <Stack.Screen
          name="ImportPGN"
          component={ImportPGNScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#2c2c2c' },
            headerTintColor: '#e0e0e0',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="RepertoireStudy"
          component={RepertoireStudyScreen}
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#2c2c2c' },
            headerTintColor: '#e0e0e0',
            title: 'Study Repertoire',
          }}
        />
        <Stack.Screen
          name="TrainingSession"
          component={TrainingSessionScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="GameReview"
          component={GameReviewScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

import Dashboard from "layouts/dashboard";
import Trades from "layouts/trades";
import TradeDetail from "layouts/trades/TradeDetail";
import Services from "layouts/services";
import SecurePanel from "layouts/services/SecurePanel";
import NetworkPanel from "layouts/services/NetworkPanel";
import GraphPanel from "layouts/services/GraphPanel";
import RiskPanel from "layouts/services/RiskPanel";
import CausalPanel from "layouts/services/CausalPanel";
import SupplyPanel from "layouts/services/SupplyPanel";
import Settings from "layouts/settings";
import LoginPage from "layouts/auth/LoginPage";

// Icons
import Icon from "@mui/material/Icon";

const routes = [
  {
    type: "collapse",
    name: "Dashboard",
    key: "dashboard",
    icon: <Icon fontSize="small">dashboard</Icon>,
    route: "/dashboard",
    component: <Dashboard />,
  },
  {
    type: "collapse",
    name: "Trades",
    key: "trades",
    icon: <Icon fontSize="small">show_chart</Icon>,
    route: "/trades",
    component: <Trades />,
  },
  { type: "route", route: "/trades/:assetId", component: <TradeDetail /> },
  {
    type: "collapse",
    name: "Services",
    key: "services",
    icon: <Icon fontSize="small">apps</Icon>,
    route: "/services",
    component: <Services />,
  },
  { type: "route", route: "/services/secure", component: <SecurePanel /> },
  { type: "route", route: "/services/network", component: <NetworkPanel /> },
  { type: "route", route: "/services/graph", component: <GraphPanel /> },
  { type: "route", route: "/services/risk", component: <RiskPanel /> },
  { type: "route", route: "/services/causal", component: <CausalPanel /> },
  { type: "route", route: "/services/supply", component: <SupplyPanel /> },
  {
    type: "collapse",
    name: "Settings",
    key: "settings",
    icon: <Icon fontSize="small">settings</Icon>,
    route: "/settings",
    component: <Settings />,
  },
  {
    type: "auth",
    name: "Login",
    key: "login",
    route: "/login",
    component: <LoginPage />,
  },
];

export default routes;

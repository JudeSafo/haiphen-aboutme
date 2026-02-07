/**
 * Services Hub - grid of 6 intelligence service cards.
 *
 * Each card shows the service name, icon, description, subscription status
 * badge, and a Launch button that navigates to the service detail panel.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

const SERVICES = [
  {
    key: "secure",
    name: "Haiphen Secure",
    icon: "shield",
    description: "CVE scanning & vulnerability assessment for industrial control systems and edge devices.",
    route: "/services/secure",
    active: true,
  },
  {
    key: "network",
    name: "Network Trace",
    icon: "router",
    description: "Protocol analysis & anomaly detection across Modbus, OPC-UA, MQTT, DNP3, and BACnet.",
    route: "/services/network",
    active: true,
  },
  {
    key: "graph",
    name: "Knowledge Graph",
    icon: "hub",
    description: "Entity & relationship mapping for OT assets, networks, and organizational topology.",
    route: "/services/graph",
    active: false,
  },
  {
    key: "risk",
    name: "Risk Analysis",
    icon: "assessment",
    description: "Monte Carlo VaR, stress testing, and portfolio-level risk quantification.",
    route: "/services/risk",
    active: true,
  },
  {
    key: "causal",
    name: "Causal Chain",
    icon: "account_tree",
    description: "Root cause analysis with propagation chain reconstruction and counterfactual reasoning.",
    route: "/services/causal",
    active: false,
  },
  {
    key: "supply",
    name: "Supply Chain Intel",
    icon: "local_shipping",
    description: "Supplier risk scoring, geopolitical exposure analysis, and alternative sourcing.",
    route: "/services/supply",
    active: false,
  },
];

// ---------------------------------------------------------------------------
// ServiceCard
// ---------------------------------------------------------------------------

function ServiceCard({ service, onLaunch }) {
  return (
    <Card>
      <MDBox p={3}>
        <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <MDBox display="flex" alignItems="center">
            <MDBox
              display="flex"
              justifyContent="center"
              alignItems="center"
              width="3rem"
              height="3rem"
              borderRadius="lg"
              variant="gradient"
              bgColor={service.active ? "info" : "dark"}
              color="white"
              shadow="md"
            >
              <Icon fontSize="medium">{service.icon}</Icon>
            </MDBox>
            <MDBox ml={2}>
              <MDTypography variant="h6" fontWeight="medium">
                {service.name}
              </MDTypography>
            </MDBox>
          </MDBox>
          <MDBadge
            badgeContent={service.active ? "Active" : "Inactive"}
            color={service.active ? "success" : "secondary"}
            variant="gradient"
            size="sm"
          />
        </MDBox>
        <MDBox mb={2}>
          <MDTypography variant="body2" color="text" fontWeight="regular">
            {service.description}
          </MDTypography>
        </MDBox>
        <MDBox display="flex" justifyContent="flex-end">
          <MDButton
            variant="gradient"
            color={service.active ? "info" : "dark"}
            size="small"
            onClick={() => onLaunch(service.route)}
            disabled={!service.active}
          >
            <Icon sx={{ mr: 0.5 }}>launch</Icon>
            Launch
          </MDButton>
        </MDBox>
      </MDBox>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Services layout
// ---------------------------------------------------------------------------

function Services() {
  const navigate = useNavigate();

  const handleLaunch = (route) => {
    navigate(route);
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <MDBox mb={3}>
          <MDTypography variant="h4" fontWeight="medium">
            Intelligence Services
          </MDTypography>
          <MDTypography variant="body2" color="text" fontWeight="regular">
            Launch and manage Haiphen protocol intelligence services.
          </MDTypography>
        </MDBox>
        <Grid container spacing={3}>
          {SERVICES.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.key}>
              <ServiceCard service={service} onLaunch={handleLaunch} />
            </Grid>
          ))}
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Services;

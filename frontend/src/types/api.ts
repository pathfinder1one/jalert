export type UserRole = 'admin' | 'health_worker' | 'public';
export type AlertSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type AlertStatus = 'active' | 'resolved' | 'acknowledged';
export type AlertType =
  | 'water_quality'
  | 'disease_outbreak'
  | 'flood_risk'
  | 'manual'
  | 'ai_predicted';
export type RiskCategory = 'low' | 'moderate' | 'high' | 'critical';
export type SensorStatus = 'active' | 'inactive' | 'faulty' | 'maintenance';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  village_id?: string | null;
  is_active: boolean;
  preferred_language: string;
  created_at: string;
}

export interface UserPreferences {
  language: string;
  comfort_mode: boolean;
  field_mode: boolean;
  accessibility_mode: boolean;
  active_village_id?: string | null;
  saved_village_ids: string[];
  email_notifications: boolean;
  sms_notifications: boolean;
  voice_notifications: boolean;
  daily_summary_enabled: boolean;
}

export interface UpdateUserProfilePayload {
  name?: string;
  phone?: string | null;
  preferred_language?: string;
}

export interface UpdateUserPreferencesPayload {
  language?: string;
  comfort_mode?: boolean;
  field_mode?: boolean;
  accessibility_mode?: boolean;
  active_village_id?: string | null;
  saved_village_ids?: string[];
  email_notifications?: boolean;
  sms_notifications?: boolean;
  voice_notifications?: boolean;
  daily_summary_enabled?: boolean;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface Village {
  id: string;
  name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  population: number;
  pincode?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface VillageDashboard {
  village: {
    id: string;
    name: string;
    district: string;
    state: string;
    population: number;
  };
  risk: {
    score: number | null;
    category: RiskCategory | 'unknown';
    outbreak_timeline_days: number | null;
    last_updated: string | null;
  };
  active_alerts: Array<{
    id: string;
    severity: AlertSeverity;
    title: string;
    created_at: string;
  }>;
  latest_sensor: {
    ph: number | null;
    turbidity: number | null;
    ecoli: number | null;
    quality_score: number | null;
    timestamp: string | null;
  };
}

export interface Sensor {
  id: string;
  village_id: string;
  sensor_code: string;
  sensor_type: string;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: SensorStatus;
  firmware_version?: string | null;
  last_seen?: string | null;
  created_at: string;
}

export interface SensorReading {
  id: string;
  sensor_id: string;
  village_id: string;
  timestamp: string;
  ph?: number | null;
  turbidity?: number | null;
  ecoli?: number | null;
  tds?: number | null;
  temperature?: number | null;
  nitrate?: number | null;
  arsenic?: number | null;
  fluoride?: number | null;
  rainfall_mm?: number | null;
  flood_level_m?: number | null;
  is_anomaly: boolean;
  quality_score?: number | null;
}

export interface SensorInventoryItem {
  sensor_id: string;
  sensor_code: string;
  sensor_type: string;
  status: SensorStatus;
  firmware_version?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  last_seen?: string | null;
  created_at?: string | null;
  village_id: string;
  village_name: string;
  district: string;
  state: string;
  population: number;
  reading_count: number;
  latest_reading_at?: string | null;
  latest_quality_score?: number | null;
  latest_ph?: number | null;
  latest_turbidity?: number | null;
  latest_ecoli?: number | null;
}

export interface SensorInventoryResponse {
  dataset_path: string;
  items: SensorInventoryItem[];
  total: number;
}

export interface Alert {
  id: string;
  village_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  recommended_actions?: string[] | Record<string, string> | null;
  affected_population?: number | null;
  triggered_by?: string | null;
  created_at: string;
  resolved_at?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  acknowledged_by_id?: string | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  escalated_at?: string | null;
  escalation_level?: number;
  escalation_reason?: string | null;
  resolution_note?: string | null;
}

export interface Prediction {
  id: string;
  village_id: string;
  risk_score: number;
  risk_category: RiskCategory;
  outbreak_timeline_days?: number | null;
  water_quality_score?: number | null;
  disease_risk_score?: number | null;
  weather_risk_score?: number | null;
  community_health_score?: number | null;
  recommended_actions?: string[] | Record<string, unknown> | null;
  shap_values?: Record<string, number> | null;
  created_at: string;
}

export interface PredictionExplanation {
  village_id: string;
  risk_score: number;
  risk_category: RiskCategory;
  shap_values?: Record<string, number> | null;
  agent_outputs?: Record<string, unknown> | null;
  explanation: string;
}

export interface HealthReport {
  id: string;
  village_id: string;
  reporter_name?: string | null;
  age?: number | null;
  gender?: string | null;
  symptoms: Record<string, string>;
  symptom_onset?: string | null;
  suspected_disease?: string | null;
  is_hospitalized: boolean;
  is_recovered: boolean;
  notes?: string | null;
  assigned_worker_id?: string | null;
  user_id?: string | null;
  created_at: string;
}

export interface HealthClusterSummary {
  village_id: string;
  period_days: number;
  total_reports: number;
  hospitalized: number;
  cluster_detected: boolean;
  top_symptoms: Array<{ symptom: string; count: number }>;
  daily_case_trend: Record<string, number>;
  alert_level: AlertSeverity;
}

export interface ManualAlertPayload {
  village_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommended_actions?: string[];
  affected_population?: number;
}

export interface HealthReportPayload {
  village_id: string;
  reporter_name?: string;
  age?: number;
  gender?: string;
  symptoms: Record<string, string>;
  symptom_onset?: string;
  suspected_disease?: string;
  is_hospitalized: boolean;
  notes?: string;
}

export interface ReportUploadResponse {
  download_url: string;
  expires_in: number;
  key: string;
}

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'voice';
export type NotificationDeliveryStatus = 'queued' | 'sent' | 'failed' | 'read';

export interface Notification {
  id: string;
  user_id: string;
  village_id?: string | null;
  alert_id?: string | null;
  kind: string;
  channel: NotificationChannel;
  severity?: AlertSeverity | null;
  title: string;
  message: string;
  link?: string | null;
  delivery_status: NotificationDeliveryStatus;
  is_read: boolean;
  read_at?: string | null;
  data?: Record<string, unknown> | null;
  created_at: string;
}

export interface AdminUserUpdatePayload {
  name?: string;
  phone?: string | null;
  role?: UserRole;
  village_id?: string | null;
  is_active?: boolean;
  preferred_language?: string;
}

export interface AdminUserPasswordResetPayload {
  new_password: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  detail?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AssistantLink {
  label: string;
  href: string;
}

export interface AssistantReply {
  id: string;
  text: string;
  links?: AssistantLink[];
  mode?: 'llm' | 'local_fallback';
  notice?: string | null;
}

export interface WaterResourceItem {
  resource_id: string;
  name: string;
  state_name: string;
  district_name: string;
  district_key: string;
  resource_type: string;
  source_dataset: string;
  observation_year?: number | null;
  water_quality_score?: number | null;
  quality_status?: string | null;
  ph?: number | null;
  tds?: number | null;
  turbidity?: number | null;
  arsenic?: number | null;
  fluoride?: number | null;
  current_level?: number | null;
  level_diff?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface WaterResourceResponse {
  summary: {
    total_resources: number;
    states_covered: number;
    groundwater_resources: number;
    surface_water_resources: number;
  };
  resources: WaterResourceItem[];
  available_states: string[];
  source_files: Record<string, string[]>;
  map: {
    portal_url: string;
    wms_url: string;
    developer_docs: string;
    wms_docs: string;
  };
}

export type CitizenRequestStatus = 'open' | 'in_progress' | 'resolved';

export interface CitizenRequest {
  id: string;
  village_id: string;
  user_id?: string | null;
  reporter_name: string;
  contact_phone?: string | null;
  category: string;
  description: string;
  severity: AlertSeverity;
  status: CitizenRequestStatus;
  preferred_channel?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CitizenRequestPayload {
  village_id: string;
  reporter_name: string;
  contact_phone?: string;
  category: string;
  description: string;
  severity: AlertSeverity;
  preferred_channel?: string;
}

export interface CitizenRequestStatusPayload {
  status: CitizenRequestStatus;
  resolution_notes?: string;
}

export interface VillageCatalog {
  states: Array<{
    name: string;
    districts: Array<{
      name: string;
      blocks: Array<{
        name: string;
        panchayats: Array<{
          name: string;
          villages: Array<{ id: string; name: string }>;
        }>;
      }>;
    }>;
  }>;
  source_label: string;
}

export interface VillageIntelligenceProfile {
  village: {
    id: string;
    name: string;
    district: string;
    state: string;
    population: number;
    latitude: number;
    longitude: number;
    quality_badge: string;
    quality_badge_label: string;
  };
  drilldown: {
    state: string;
    district: string;
    block: string;
    panchayat: string;
    source_label: string;
  };
  coverage: {
    households: number;
    tap_connected_households: number;
    remaining_households: number;
    tap_coverage_percent: number;
    schools: { total: number; covered: number };
    anganwadi: { total: number; covered: number };
    habitation_count: number;
    source_label: string;
    source_reference: string;
  };
  iot_monitoring: {
    tank_level_percent: number;
    pump_runtime_hours: number;
    chlorine_residual_mg_l: number;
    supply_hours_today: number;
    last_successful_delivery_time?: string | null;
    source_label: string;
    sensor_count: number;
  };
  testing_summary: {
    last_lab_test_at?: string | null;
    ftk_test_count: number;
    contamination_found: boolean;
    safe_after_retest: boolean;
    tested_by: string;
    source_label: string;
  };
  source_scheme: {
    sources: Array<{
      name: string;
      source_type: string;
      treatment_required: boolean;
      treatment_available: boolean;
      supply_route: string[];
      coordinate_confidence: string;
      distance_km?: number | null;
    }>;
    schemes: Array<{
      name: string;
      scheme_type: string;
      service_status: string;
      treatment_stage: string;
      connected_sources: string[];
      official_reference: string;
      source_label: string;
    }>;
  };
  groundwater: {
    available: boolean;
    message?: string;
    pre_monsoon_level_m?: number | null;
    post_monsoon_level_m?: number | null;
    level_change_m?: number | null;
    recharge_trend?: string;
    district_comparison?: string;
    coordinate_confidence?: string;
    official_reference: string;
  };
  affordability: {
    tanker_dependency: boolean;
    monthly_spend_inr: number;
    high_burden: boolean;
    support_eligibility: boolean;
    source_label: string;
    official_reference: string;
  };
  monsoon_preparedness: {
    score: number;
    label: string;
    advice: string;
  };
  household_vulnerability: {
    score: number;
    label: string;
    summary: string;
  };
  family_actions: string[];
  contaminants: Array<{
    slug: string;
    label: string;
    latest_value?: number | null;
    safe_limit: number;
    status: string;
    explanation: string;
  }>;
  nearby_safe_sources: Array<{
    name: string;
    state_name: string;
    district_name: string;
    resource_type: string;
    water_quality_score?: number | null;
    distance_km?: number | null;
    coordinate_confidence: string;
    latitude?: number | null;
    longitude?: number | null;
  }>;
  alternate_source: {
    available: boolean;
    message: string;
    source_name?: string;
    distance_km?: number | null;
    map_link?: string | null;
  };
  mapped_contacts: Array<{
    name: string;
    role: string;
    phone?: string | null;
    email?: string | null;
    channel: string;
    reference_url?: string;
  }>;
  official_ingestion: {
    jjm_export: {
      available: boolean;
      files: string[];
      status: string;
    };
    ftk_lab: {
      available: boolean;
      files: string[];
      status: string;
    };
  };
  timeline: Array<{
    type: string;
    title: string;
    timestamp?: string | null;
    detail: string;
  }>;
  trust_documents: {
    official_references: Array<{
      label: string;
      url: string;
      availability: string;
    }>;
    local_documents: Array<{
      label: string;
      type: string;
      status: string;
      reference: string;
    }>;
  };
  transparency: {
    last_sensor_update?: string | null;
    last_prediction_update?: string | null;
    prediction_confidence: number;
    coordinate_accuracy_note: string;
    government_references: string[];
  };
}

export interface VillageComparisonResponse {
  villages: Array<{
    id: string;
    name: string;
    district: string;
    state: string;
    population: number;
    quality_score?: number | null;
    risk_score?: number | null;
    risk_category: string;
    alert_count: number;
    sensor_uptime: string;
  }>;
}

export interface VillageMapOverview {
  states: Array<{
    name: string;
    village_count: number;
    risk_score: number;
    polygon: number[][];
    center: [number, number];
  }>;
  districts: Array<{
    state: string;
    name: string;
    village_count: number;
    risk_score: number;
    polygon: number[][];
    center: [number, number];
  }>;
  villages: Array<{
    id: string;
    name: string;
    district: string;
    state: string;
    panchayat: string;
    latitude: number;
    longitude: number;
    risk_score: number;
    risk_category: string;
    quality_badge: string;
    quality_score?: number | null;
    contaminants: Record<string, string>;
    source_count: number;
    safe_source_count: number;
    coordinate_confidence: string;
    groundwater_level_m?: number | null;
    groundwater_accuracy: string;
  }>;
  clusters: Array<{
    key: string;
    label: string;
    count: number;
    risk_score: number;
    center: [number, number];
    level: 'state' | 'district';
  }>;
  legend: {
    risk: string[];
    source_types: string[];
    confidence: string[];
  };
  season: string;
  contaminant: string;
}

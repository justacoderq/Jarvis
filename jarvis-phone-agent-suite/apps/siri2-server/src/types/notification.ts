export interface NotificationInfo {
  key: string;
  packageName: string;
  title: string;
  text: string;
  subText: string;
  time: number;
  actions: string[];
  isOngoing: boolean;
  isClearable: boolean;
}

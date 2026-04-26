/* eslint-disable @typescript-eslint/no-explicit-any */
import { SPFI } from "@pnp/sp";
import "@pnp/sp/profiles";
import "@pnp/sp/site-users/web";
import { CacheService } from "./CacheService";

export interface IUserProfile {
  id: number;
  loginName: string;
  email: string;
  displayName: string;
  title: string;
  department: string;
  jobTitle: string;
  phone: string;
  mobile: string;
  office: string;
  pictureUrl: string;
  manager: string;
  managerEmail: string;
  workEmail: string;
  sipAddress: string;
  aboutMe: string;
  personalUrl: string;
  userPrincipalName: string;
  accountName: string;
  firstName: string;
  lastName: string;
  properties: Record<string, any>;
}

const USER_PROFILE_CACHE_KEY = 'user_profile';
// User profile is unlikely to change, cache for 24 hours
const USER_PROFILE_CACHE_TIMEOUT = 60 * 24; // 24 hours in minutes

export class UserProfileService {
  private sp: SPFI;
  private cacheService: CacheService;

  constructor(sp: SPFI) {
    this.sp = sp;
    this.cacheService = new CacheService({ keyPrefix: 'hbwp_user_' });
  }

  /**
   * Gets the current user's profile from cache or fetches it
   */
  public async getCurrentUserProfile(): Promise<IUserProfile> {
    return this.cacheService.getOrFetch<IUserProfile>(
      USER_PROFILE_CACHE_KEY,
      async () => await this.fetchCurrentUserProfile(),
      USER_PROFILE_CACHE_TIMEOUT
    );
  }

  /**
   * Forces a refresh of the user profile cache
   */
  public async refreshUserProfile(): Promise<IUserProfile> {
    this.cacheService.remove(USER_PROFILE_CACHE_KEY);
    return this.getCurrentUserProfile();
  }

  /**
   * Clears the user profile cache
   */
  public clearCache(): void {
    this.cacheService.remove(USER_PROFILE_CACHE_KEY);
  }

  /**
   * Helper to safely get a property value from the properties object
   */
  // eslint-disable-next-line @typescript-eslint/dot-notation
  private getProp(properties: Record<string, any>, key: string): string {
    return properties[key] || '';
  }

  /**
   * Fetches the current user's profile from SharePoint
   */
  private async fetchCurrentUserProfile(): Promise<IUserProfile> {
    try {
      // Get basic user info
      const currentUser = await this.sp.web.currentUser();
      
      // Get detailed profile properties
      const profileProps = await this.sp.profiles.myProperties();
      
      // Extract user profile properties into a more usable format
      const properties: Record<string, any> = {};
      if (profileProps.UserProfileProperties) {
        for (const prop of profileProps.UserProfileProperties) {
          properties[prop.Key] = prop.Value;
        }
      }

      /* eslint-disable @typescript-eslint/dot-notation */
      const userProfile: IUserProfile = {
        id: currentUser.Id,
        loginName: currentUser.LoginName,
        email: currentUser.Email || '',
        displayName: profileProps.DisplayName || currentUser.Title || '',
        title: currentUser.Title || '',
        department: this.getProp(properties, 'Department'),
        jobTitle: this.getProp(properties, 'SPS-JobTitle') || this.getProp(properties, 'Title'),
        phone: this.getProp(properties, 'WorkPhone'),
        mobile: this.getProp(properties, 'CellPhone'),
        office: this.getProp(properties, 'Office') || this.getProp(properties, 'SPS-Location'),
        pictureUrl: profileProps.PictureUrl || this.getProp(properties, 'PictureURL'),
        manager: this.getProp(properties, 'Manager'),
        managerEmail: this.getProp(properties, 'SPS-Manager'),
        workEmail: this.getProp(properties, 'WorkEmail') || currentUser.Email || '',
        sipAddress: this.getProp(properties, 'SPS-SipAddress'),
        aboutMe: this.getProp(properties, 'AboutMe'),
        personalUrl: profileProps.PersonalUrl || this.getProp(properties, 'PersonalSpace'),
        userPrincipalName: currentUser.UserPrincipalName || this.getProp(properties, 'SPS-UserPrincipalName'),
        accountName: profileProps.AccountName || this.getProp(properties, 'AccountName'),
        firstName: this.getProp(properties, 'FirstName'),
        lastName: this.getProp(properties, 'LastName'),
        properties: properties
      };
      /* eslint-enable @typescript-eslint/dot-notation */

      return userProfile;
    } catch (error) {
      console.error('UserProfileService: Error fetching user profile:', error);
      
      // Return a minimal profile on error
      return {
        id: 0,
        loginName: '',
        email: '',
        displayName: 'Unknown User',
        title: '',
        department: '',
        jobTitle: '',
        phone: '',
        mobile: '',
        office: '',
        pictureUrl: '',
        manager: '',
        managerEmail: '',
        workEmail: '',
        sipAddress: '',
        aboutMe: '',
        personalUrl: '',
        userPrincipalName: '',
        accountName: '',
        firstName: '',
        lastName: '',
        properties: {}
      };
    }
  }
}

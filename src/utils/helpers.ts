// helpers.ts
import Setting from '../models/Setting';

export const getSettingValue = async (key: string): Promise<string | null> => {
  try {
    const setting = await Setting.findOne({ key });
    return setting?.value ?? null;
  } catch (err) {
    console.error(`Error fetching setting for key "${key}":`, err);
    return null;
  }
};

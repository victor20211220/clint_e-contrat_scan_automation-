import jwt from 'jsonwebtoken';

export const generateToken = (userId: string, isAdmin: boolean) => {
  return jwt.sign({ id: userId, is_admin: isAdmin }, process.env.JWT_SECRET!, { expiresIn: '24h' });
};

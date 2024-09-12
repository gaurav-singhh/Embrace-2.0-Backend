import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
// verfy karega use hai ki nahi hai.

//req ke pass cookies ka acces kyu hume app.js me pass kiya cookie pasrser
export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", ""); //header mobile app ke liye.

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken",
    ); //_id isiliye kyuki wo key tha model me key ka jab generate funtion banaya tha.

    if (!user) {
      //TODO: about frontend
      throw new ApiError(401, "Invalid Access Token");
    }
    req.user = user; //req me user field add kardi with all the info
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});

//next ka kaam hai ki bas agle kaam pe leke jao.

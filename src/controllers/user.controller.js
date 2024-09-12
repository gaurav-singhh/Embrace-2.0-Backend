import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId); // user ke pass sab ka access hoga jobhi model me tha sab.
    const accessToken = user.generateAccesToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "somthing went wrong while generating refresh and access token",
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with same email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path; //[0]  first property ke ander object. path jo multer ne uplaod kara hai wo mil jayega.
  //TODO:console log file.
  console.log("Req.files", req.files);

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  //database entry using user.

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    email,
    password,
    username: username.toLowerCase(),
  });

  // mongodb har ek entry ke saath ke _id naam ka fiels add kar deta hai extra .

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  if (!createdUser) {
    throw new ApiError(500, "somethig went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // take data(username password) from frontend. (req.body)
  // validate in database if the user with same (username Or email) and password exist if yes then give access.
  // yes - pe give access token and refresh token.
  // no - throw does not exist
  // send cookie

  const { email, username, password } = req.body;

  if (!(username || email)) {
    throw new ApiError(400, "username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }], // yaa to email se dhundh do yaa to username se
  });

  if (!user) {
    throw new ApiError(404, "user does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password); //capital User mongoose ka ek object hai(findOne jaise ko acces kar sakte hai) mongodb ka jo mongoose hai uske through available hai.
  // lekin jo humne method banaya hai models me wo humare user me available hai(ispasswordcorrect, generate token,etc)
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id,
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken ",
  );

  // sending cookies

  const options = {
    // ye karne se cookies sirf server se modiy hoti hai front end se modify nahi hogi.
    httpOnly: true,
    secure: true,
  };
  console.log("login Success");

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In Successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true, //respose jo value milegi wo updated milegi(undefined wala)
    },
  );

  const options = {
    // ye karne se cookies sirf server se modiy hoti hai front end se modify nahi hogi.
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh Token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newrefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newrefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            newrefreshToken,
          },

          "Access token refreshed",
        ),
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldpassword, newPassword } = req.body; // //TODO: we can also add confirm password field here. but we handel that is fronend also.
  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldpassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Ivalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "password changed succecsuly"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  // const user = User.findById(req.user.id);  no need of this aisa karenge to sab ka access aajayega including password selec nahi kiya hai yahn.
  // direct selected hi aarha hai middle wate auth se jo beech me run krenge is route pe.

  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"));
});
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!email || !fullName) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }, //updated user ki value return hojati hai.
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated succesfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on Avatar");
  }

  const deluser = await findById(req.user?._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  // delete old avatar from cloudinary
  const oldAvatarUrl = deluser.avatar;
  if (oldAvatarUrl) {
    const publicId = oldAvatarUrl.split("/").pop().split(".")[0];
    await deleteOnCloudinary(publicId);
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true },
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "avatar Image updated successfully"));
}); //TODO: work on delete of old avatar.

const getUserPageProfile = asyncHandler(async (req, res) => {
  // Extract the username from the request parameters
  const { username } = req.params;

  // Check if the username is provided and not just whitespace
  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  // Aggregate user data along with their subscribers and subscriptions
  const channel = await User.aggregate([
    {
      // Match the user document with the provided username
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      // Lookup subscribers from the subscriptions collection
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "followedUser",
        as: "subscribers",
      },
    },
    {
      // Lookup subscriptions from the subscriptions collection
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "follower",
        as: "subscribedTo",
      },
    },
    {
      // Add additional fields to the user document
      $addFields: {
        // Count the number of subscribers
        subscribersCount: {
          $size: "$subscribers",
        },
        // Count the number of channels the user is subscribed to
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        // Check if the current user is subscribed to this user
        isSubscribed: {
          $cond: {
            if: {
              $in: [
                mongoose.Types.ObjectId(req.user?._id),
                "$subscribers.follower",
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      // Project only the necessary fields to the output
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  // If no user document is found, throw a 404 error
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exist");
  }

  // Return the user profile data as a JSON response
  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully"),
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: "posts",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully",
      ),
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  getUserPageProfile,
  getWatchHistory,
};

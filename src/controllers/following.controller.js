 import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Toggle follow/unfollow a user
const toggleFollow = asyncHandler(async (req, res) => {
  const { followedUserId } = req.params;
  const followerId = req.user._id;

  if (followerId.toHexString() === followedUserId) {
    throw new ApiError(401, "Self-Following is prohibited");
  }

  let isFollowing = await Subscription.findOne({
    followedUser: followedUserId,
    follower: followerId,
  });

  if (isFollowing) {
    await Subscription.findByIdAndDelete(isFollowing?._id);
    return res
      .status(200)
      .json(new ApiResponse(200, null, "User Unfollowed"));
  } else {
    await Subscription.create({
      followedUser: followedUserId,
      follower: followerId,
    });
    return res
      .status(200)
      .json(new ApiResponse(200, null, "User Followed"));
  }
});

// Get followers of a user
const getUserFollowers = asyncHandler(async (req, res) => {
  let { userId } = req.params; // page of the user we are currently viewing 

  userId = new mongoose.Types.ObjectId(userId);

  const userFollowers = await Subscription.aggregate([
    {
      $match: {
        followedUser: userId,  // Find all users who follow the given userId
      },
    },
    {
      $lookup: {
        from: "users",  // Join with the users collection to get follower details
        localField: "follower",
        foreignField: "_id",
        as: "follower",
      },
    },
    {
      $unwind: "$follower",  // Unwind the follower array so each document represents one follower
    },
    {
      $project: {
        _id: 0,  // Exclude the _id of the subscription document
        follower: {
          _id: 1,
          username: 1,
          fullName: 1,
          avatar: 1,  // Include only the necessary fields for the follower
        },
      },
    },
    {
      $group: {
        _id: null,  // Group all documents together to calculate the total count
        followers: { $push: "$follower" },  // Collect all followers into an array
        followerCount: { $sum: 1 },  // Count the number of followers
      },
    },
    {
      $project: {
        _id: 0,  // Exclude the group _id
        followers: 1,  // Return the array of followers
        followerCount: 1,  // Return the total count of followers
      },
    },
  ]);
  

  if (!userFollowers)
    throw new ApiError(500, "Fetching User Followers failed");
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userFollowers,
        "User Followers fetched Successfully"
      )
    );
});

// Get users followed by a user(user whose page we are viewing)
const userFollowing = await Subscription.aggregate([
  {
    $match: {
      follower: new mongoose.Types.ObjectId(userId),  // Find all users that the current user is following
    },
  },
  {
    $lookup: {
      from: "users",  // Join with the users collection to get details of the followed users
      localField: "followedUser",
      foreignField: "_id",
      as: "followedUser",
    },
  },
  {
    $unwind: "$followedUser",  // Unwind the followedUser array to return individual documents for each followed user
  },
  {
    $project: {
      _id: 0,  // Exclude the _id of the subscription document
      followedUser: {
        _id: 1,
        username: 1,
        fullName: 1,
        avatar: 1,  // Return only the necessary user fields
      },
    },
  },
  {
    $group: {
      _id: null,  // Group all the followed users together to calculate the total count
      followedUsers: { $push: "$followedUser" },  // Collect all followed users into an array
      followingCount: { $sum: 1 },  // Count the number of followed users
    },
  },
  {
    $project: {
      _id: 0,  // Exclude the group _id
      followedUsers: 1,  // Return the array of followed users
      followingCount: 1,  // Return the total count of followed users
    },
  },
]);


export { toggleFollow, getUserFollowers, getUserFollowing };
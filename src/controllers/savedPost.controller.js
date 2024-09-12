import mongoose, { isValidObjectId } from "mongoose";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Save a post
const savePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid postId");
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $addToSet: { savedPosts: postId },
    },
    { new: true }
  ).populate("savedPosts");

  return res
    .status(200)
    .json(new ApiResponse(200, user.savedPosts, "Post saved successfully"));
});

// Remove a saved post
const removeSavedPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    throw new ApiError(400, "Invalid postId");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $pull: { savedPosts: postId },
    },
    { new: true }
  ).populate("savedPosts");

  return res
    .status(200)
    .json(new ApiResponse(200, user.savedPosts, "Post removed from saved posts"));
});

// Get all saved posts for a user
const getSavedPosts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate("savedPosts");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user.savedPosts, "Saved posts fetched successfully"));
});

export { savePost, removeSavedPost, getSavedPosts };
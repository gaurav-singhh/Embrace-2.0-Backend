import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Post } from "../models/post.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Toggle like for a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id;

  if (!isValidObjectId(commentId)) throw new ApiError(401, "Invalid CommentID");

  let commentLike = await Like.findOne({
    comment: commentId,
    likedBy: userId,
  });

  if (commentLike) {
    await Like.findByIdAndDelete(commentLike._id);
    return res.status(200).json(new ApiResponse(200, null, "Comment unliked"));
  } else {
    commentLike = await Like.create({ comment: commentId, likedBy: userId });
    return res.status(200).json(new ApiResponse(200, null, "Comment liked"));
  }
});

// Toggle like for a post
const togglePostLike = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const userId = req.user._id;

  if (!isValidObjectId(postId)) throw new ApiError(401, "Invalid PostID");

  let postLike = await Like.findOne({
    post: postId,
    likedBy: userId,
  });

  if (postLike) {
    await Like.findByIdAndDelete(postLike._id);
    return res.status(200).json(new ApiResponse(200, null, "Post unliked"));
  } else {
    postLike = await Like.create({ post: postId, likedBy: userId });
    return res.status(200).json(new ApiResponse(200, null, "Post liked"));
  }
});

// Get liked comments for a user
const getLikedComments = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  try {
    const likedComments = await Like.aggregate([
      {
        $match: {
          likedBy: new mongoose.Types.ObjectId(userId),
          comment: { $exists: true },
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "comment",
          foreignField: "_id",
          as: "likedComment",
          pipeline: [
            {
              $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
              },
            },
            {
              $unwind: "$ownerDetails",
            },
          ],
        },
      },
      {
        $unwind: "$likedComment",
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $project: {
          _id: 0,
          likedComment: {
            _id: 1,
            content: 1,
            post: 1,
            owner: 1,
            createdAt: 1,
            ownerDetails: {
              username: 1,
              fullName: 1,
              "avatar.url": 1,
            },
          },
        },
      },
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          likedComments,
          "Liked comments fetched successfully",
        ),
      );
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to get liked comments");
  }
});

// Get liked posts for a user
const getLikedPosts = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  try {
    const likedPosts = await Like.aggregate([
      {
        $match: {
          likedBy: new mongoose.Types.ObjectId(userId),
          post: { $exists: true },
        },
      },
      {
        $lookup: {
          from: "posts",
          localField: "post",
          foreignField: "_id",
          as: "likedPost",
          pipeline: [
            {
              $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
              },
            },
            {
              $unwind: "$ownerDetails",
            },
          ],
        },
      },
      {
        $unwind: "$likedPost",
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $project: {
          _id: 0,
          likedPost: {
            _id: 1,
            content: 1,
            image: 1,
            views: 1,
            isPublished: 1,
            owner: 1,
            createdAt: 1,
            ownerDetails: {
              username: 1,
              fullName: 1,
              "avatar.url": 1,
            },
          },
        },
      },
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(200, likedPosts, "Liked posts fetched successfully"),
      );
  } catch (error) {
    throw new ApiError(500, error?.message || "Failed to get liked posts");
  }
});

export { toggleCommentLike, togglePostLike, getLikedComments, getLikedPosts };

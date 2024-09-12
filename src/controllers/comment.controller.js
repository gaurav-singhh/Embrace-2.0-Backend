import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { Post } from "../models/post.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getPostComments = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { page = 1, limit = 10 } = req.query; //TODO:change the values here.
  const isGuest = req.query.guest === "true";

  if (!isValidObjectId(postId)) throw new ApiError(401, "Invalid PostID");

  const post = await Post.findById(postId);

  if (!post) throw new ApiError(404, "Post not found");

  const commentsAggregate = Comment.aggregate([
    {
      $match: {
        post: new mongoose.Types.ObjectId(postId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
        as: "likes",
      },
    },
    {
      $addFields: {
        likesCount: {
          $size: "$likes",
        },
        owner: {
          $first: "$owner",
        },
        isLiked: {
          $cond: {
            if: isGuest,
            then: false,
            else: {
              $cond: {
                if: { $in: [req.user?._id, "$likes.likedBy"] },
                then: true,
                else: false,
              },
            },
          },
        },
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $project: {
        content: 1,
        createdAt: 1,
        likesCount: 1,
        owner: {
          username: 1,
          fullName: 1,
          "avatar.url": 1,
          _id: 1,
        },
        isLiked: 1,
      },
    },
  ]);

  if (!commentsAggregate) {
    throw new ApiError(500, "Error creating comments aggregate");
  }

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const comments = await Comment.aggregatePaginate(commentsAggregate, options);

  if (!comments) throw new ApiError(501, "Comments Pagination failed");

  return res
    .status(200)
    .json(
      new ApiResponse(200, comments, "Post Comments fetched Successfully")
    );
});

const addComment = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  if (!content) throw new ApiError(404, "Comment content is required");
  const post = await Post.findById(postId);

  if (!post) throw new ApiError(404, "Post not found");
  const comment = await Comment.create({
    post: postId,
    content,
    owner: req.user._id,
  });

  if (!comment) throw new ApiError(500, "Error adding comment");

  return res.status(200).json(new ApiResponse(200, content, "Comment added"));
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;

  if (!content) throw new ApiError(404, "Comment content is required");

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment Id");
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  if (comment?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "only comment owner can edit their comment");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { $set: { content } },
    { new: true }
  );
  if (!updatedComment) throw new ApiError(500, "Error updating comment");

  return res
    .status(200)
    .json(new ApiResponse(200, updatedComment, "Comment updated"));
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?._id;

  if (!isValidObjectId(commentId))
    throw new ApiError(401, "Invalid Comment ID");

  const comment = await Comment.findById(commentId);

  if (!comment) throw new ApiError(404, "Comment not found");

  if (comment?.owner.toString() !== userId.toString()) {
    throw new ApiError(400, "only owner can delete their Comment");
  }
  await Comment.findByIdAndDelete(commentId);

  return res.status(200).json(new ApiResponse(200, null, "Comment deleted"));
});

export { getPostComments, addComment, updateComment, deleteComment };
